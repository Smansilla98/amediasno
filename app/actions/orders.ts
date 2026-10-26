'use server'

import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { cashMovements, customers, orderItems, orders, payments, products, stockMovements } from '@/lib/db/schema'
import { ORDER_STATUS, PAYMENT_METHODS, paymentStatusFor, type OrderStatus } from '@/lib/domain'
import { amount, clean, lockOrder, ownAccount, ownCustomer, required } from '@/lib/guards'
import { run, UserError } from '@/lib/session'
import { applyOrderStatus } from '@/lib/stock'

const method = (value?: string) => (PAYMENT_METHODS as readonly string[]).includes(value ?? '') ? value! : 'Efectivo'

export type OrderInput = {
  fulfillment?: 'pending' | 'ready' | 'delivered'
  customerId?: string
  newCustomer?: { name: string; phone?: string }
  firstName?: string
  lastName?: string
  block?: string
  professor?: string
  venue?: string
  deliveryDate?: string
  notes?: string
  items: { productId: string; size?: string; quantity: number; unitPriceCents?: number }[]
  /** Sólo cuando el pedido no lleva productos del catálogo. */
  manualTotalCents?: number
  depositCents?: number
  method?: string
  accountId?: string
}

export async function createOrder(input: OrderInput) {
  return run(async (userId) => {
    if (!input.customerId && !input.newCustomer?.name.trim()) throw new UserError('Elegí un cliente o cargá uno nuevo.')
    if (input.accountId) await ownAccount(db, userId, input.accountId)

    return db.transaction(async (tx) => {
      // Un pedido a la vez por cuenta: evita códigos repetidos si se cargan dos juntos.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)

      const customer = input.customerId
        ? await ownCustomer(tx, userId, input.customerId)
        : (await tx.insert(customers).values({ id: crypto.randomUUID(), userId, name: input.newCustomer!.name.trim(), phone: clean(input.newCustomer!.phone) }).returning())[0]

      const lines = []
      for (const item of input.items) {
        const [product] = await tx.select().from(products).where(and(eq(products.id, item.productId), eq(products.userId, userId)))
        if (!product || !product.active) throw new UserError('Uno de los productos ya no está disponible.')
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10_000) throw new UserError(`Revisá la cantidad de ${product.name}.`)
        if (product.sizes.length && (!item.size || !product.sizes.includes(item.size))) throw new UserError(`Elegí un talle válido de ${product.name}.`)
        const unitPriceCents = amount(item.unitPriceCents ?? product.priceCents, `Revisá el precio de ${product.name}.`, { allowZero: true })
        lines.push({ product, size: clean(item.size), quantity: item.quantity, unitPriceCents })
      }
      const totalCents = lines.length ? lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0) : amount(input.manualTotalCents ?? 0, 'Agregá al menos un producto o un total.')
      if (totalCents <= 0) throw new UserError('El total del pedido tiene que ser mayor a cero.')
      const depositCents = amount(input.depositCents ?? 0, 'Revisá la seña.', { allowZero: true })
      if (depositCents > totalCents) throw new UserError('La seña no puede ser mayor al total.')

      const codes = await tx.select({ code: orders.code }).from(orders).where(eq(orders.userId, userId))
      const last = codes.reduce((max, row) => Math.max(max, Number(/^PED-(\d+)$/.exec(row.code)?.[1] ?? 0)), 1000)
      const [first, ...rest] = customer.name.split(' ')
      const sizes = [...new Set(lines.map((line) => line.size).filter(Boolean))].join(', ')

      const [order] = await tx.insert(orders).values({
        id: crypto.randomUUID(), userId, customerId: customer.id, code: `PED-${last + 1}`,
        status: 'pending', paymentStatus: paymentStatusFor(totalCents, depositCents),
        totalCents, depositCents, paidCents: depositCents,
        firstName: clean(input.firstName) ?? first, lastName: clean(input.lastName) ?? (clean(input.firstName) ? null : rest.join(' ') || null),
        size: sizes || null, block: clean(input.block), professor: clean(input.professor), venue: clean(input.venue),
        deliveryDate: clean(input.deliveryDate), notes: clean(input.notes),
      }).returning()

      for (const line of lines) {
        await tx.insert(orderItems).values({ id: crypto.randomUUID(), orderId: order.id, productId: line.product.id, size: line.size, quantity: line.quantity, unitPriceCents: line.unitPriceCents, unitCostCents: line.product.costCents })
        await tx.update(products).set({ requestedStock: sql`${products.requestedStock} + ${line.quantity}` }).where(eq(products.id, line.product.id))
        await tx.insert(stockMovements).values({ id: crypto.randomUUID(), userId, productId: line.product.id, size: line.size, type: 'requested', quantity: line.quantity, notes: `Pedido ${order.code}` })
      }
      if (input.fulfillment && !['pending', 'ready', 'delivered'].includes(input.fulfillment)) throw new UserError('Forma de entrega inválida.')
      if (input.fulfillment && input.fulfillment !== 'pending') {
        if (!lines.length) throw new UserError('Agregá productos para usar stock.')
        await applyOrderStatus(tx, order, input.fulfillment)
        order.status = input.fulfillment
      }
      if (depositCents > 0) {
        await tx.insert(payments).values({ id: crypto.randomUUID(), userId, orderId: order.id, amountCents: depositCents, method: method(input.method), notes: 'Seña' })
        if (input.accountId) await tx.insert(cashMovements).values({ id: crypto.randomUUID(), userId, accountId: input.accountId, type: 'income', amountCents: depositCents, description: `Seña ${order.code}`, orderId: order.id })
      }
      return order
    })
  })
}

export async function updateOrder(input: { id: string; firstName?: string; lastName?: string; block?: string; professor?: string; venue?: string; deliveryDate?: string; notes?: string }) {
  return run(async (userId) => db.transaction(async (tx) => {
    await lockOrder(tx, userId, input.id)
    await tx.update(orders).set({
      firstName: required(input.firstName, 'Indicá para quién es el pedido.'), lastName: clean(input.lastName),
      block: clean(input.block), professor: clean(input.professor), venue: clean(input.venue),
      deliveryDate: clean(input.deliveryDate), notes: clean(input.notes),
    }).where(eq(orders.id, input.id))
    return undefined
  }))
}

export async function setOrderStatus(id: string, status: OrderStatus) {
  return run(async (userId) => {
    if (!Object.hasOwn(ORDER_STATUS, status)) throw new UserError('Estado inválido.')
    return db.transaction(async (tx) => {
      const order = await lockOrder(tx, userId, id)
      if (order.status === 'cancelled' && status !== 'pending') throw new UserError('Para retomar un pedido cancelado, primero volvelo a "Tomado".')
      await applyOrderStatus(tx, order, status)
      return undefined
    })
  })
}

export async function recordPayment(input: { orderId: string; amountCents: number; method?: string; accountId?: string; notes?: string }) {
  return run(async (userId) => {
    const cents = amount(input.amountCents, 'Ingresá el importe del pago.')
    if (input.accountId) {
      const account = await ownAccount(db, userId, input.accountId)
      if (!account.active) throw new UserError('Esa cuenta está archivada.')
    }
    return db.transaction(async (tx) => {
      const order = await lockOrder(tx, userId, input.orderId)
      if (order.status === 'cancelled') throw new UserError('El pedido está cancelado.')
      const balance = order.totalCents - order.paidCents
      if (cents > balance) throw new UserError(balance > 0 ? `El saldo del pedido es menor al importe ingresado.` : 'Este pedido ya está pagado.')
      const paid = order.paidCents + cents
      await tx.insert(payments).values({ id: crypto.randomUUID(), userId, orderId: order.id, amountCents: cents, method: method(input.method), notes: clean(input.notes) })
      await tx.update(orders).set({ paidCents: paid, paymentStatus: paymentStatusFor(order.totalCents, paid) }).where(eq(orders.id, order.id))
      if (input.accountId) await tx.insert(cashMovements).values({ id: crypto.randomUUID(), userId, accountId: input.accountId, type: 'income', amountCents: cents, description: `Pago ${order.code}`, orderId: order.id })
      return undefined
    })
  })
}

/** Anula un pago cargado por error y devuelve el saldo al pedido. */
export async function voidPayment(id: string) {
  return run(async (userId) => db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(and(eq(payments.id, id), eq(payments.userId, userId)))
    if (!payment) throw new UserError('No encontré ese pago.')
    const order = await lockOrder(tx, userId, payment.orderId)
    const paid = Math.max(0, order.paidCents - payment.amountCents)
    await tx.delete(payments).where(eq(payments.id, id))
    await tx.update(orders).set({ paidCents: paid, depositCents: Math.min(order.depositCents, paid), paymentStatus: paymentStatusFor(order.totalCents, paid) }).where(eq(orders.id, order.id))
    // El pago no guarda en qué cuenta entró: se compensa el ingreso equivalente más reciente de ese pedido.
    const [movement] = await tx.select().from(cashMovements)
      .where(and(eq(cashMovements.userId, userId), eq(cashMovements.orderId, order.id), eq(cashMovements.type, 'income'), eq(cashMovements.amountCents, payment.amountCents)))
      .orderBy(sql`${cashMovements.occurredAt} desc`).limit(1)
    if (movement) await tx.delete(cashMovements).where(eq(cashMovements.id, movement.id))
    return undefined
  }))
}
