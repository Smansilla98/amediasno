'use server'

import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { db, type Tx } from '@/lib/db'
import { batchOrders, expenses, orderItems, orders, productionBatches, products, stockMovements, stockReceipts, suppliers, supplierBatches } from '@/lib/db/schema'
import { BATCH_STATUS, todayISO, type BatchStatus } from '@/lib/domain'
import { clean, lockBatch, ownSupplier, required } from '@/lib/guards'
import { run, UserError } from '@/lib/session'
import { changePhysicalStock, lockInventory } from '@/lib/inventory'
import { applyOrderStatus, reserveIfPossible } from '@/lib/stock'

export async function saveSupplier(input: { id?: string; name: string; contact?: string; categories: string[] }) {
  return run(async (userId) => {
    const values = { name: required(input.name, 'El nombre del proveedor es obligatorio.'), contact: clean(input.contact), categories: [...new Set(input.categories.map((item) => item.trim()).filter(Boolean))] }
    if (input.id) {
      await ownSupplier(db, userId, input.id)
      const [row] = await db.update(suppliers).set(values).where(and(eq(suppliers.id, input.id), eq(suppliers.userId, userId))).returning()
      return row
    }
    const [row] = await db.insert(suppliers).values({ id: crypto.randomUUID(), userId, ...values }).returning()
    return row
  })
}

export async function setSupplierActive(id: string, active: boolean) {
  return run(async (userId) => {
    await ownSupplier(db, userId, id)
    await db.update(suppliers).set({ active }).where(and(eq(suppliers.id, id), eq(suppliers.userId, userId)))
    return undefined
  })
}

export type StockLine = { productId: string; size?: string; quantity: number }

/** Valida y guarda las líneas de reposición (sin venta asociada) de un pedido a fábrica. */
async function insertStockLines(tx: Tx, userId: string, supplierId: string, batchId: string, lines: StockLine[]) {
  for (const line of lines) {
    const [product] = await tx.select().from(products).where(and(eq(products.id, line.productId), eq(products.userId, userId)))
    if (!product?.active) throw new UserError('Elegí un producto activo para reponer.')
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 10_000) throw new UserError(`Revisá la cantidad de ${product.name}.`)
    const size = clean(line.size)
    if (product.sizes.length && (!size || !product.sizes.includes(size))) throw new UserError(`Elegí un talle válido de ${product.name}.`)
    await tx.insert(supplierBatches).values({ id: crypto.randomUUID(), userId, supplierId, batchId, productId: product.id, size, quantity: line.quantity, unitCostCents: product.costCents })
  }
}

/**
 * Crea o edita un pedido a fábrica. Puede llevar reposición de stock, ventas
 * pendientes o ambas. Al editar, `stockItems` reemplaza la reposición.
 */
export async function saveBatch(input: { id?: string; supplierId: string; name: string; expectedAt?: string; notes?: string; orderIds?: string[]; stockItems?: StockLine[] }) {
  return run(async (userId) => {
    const supplier = await ownSupplier(db, userId, required(input.supplierId, 'Elegí un proveedor.'))
    const values = { supplierId: supplier.id, name: required(input.name, 'Poné un nombre al pedido.'), expectedAt: clean(input.expectedAt), notes: clean(input.notes) }
    return db.transaction(async (tx) => {
      await lockInventory(tx, userId)
      if (input.id) {
        const batch = await lockBatch(tx, userId, input.id)
        if (batch.status === 'received') throw new UserError('Un pedido ya recibido no se puede editar.')
        const [row] = await tx.update(productionBatches).set(values).where(eq(productionBatches.id, batch.id)).returning()
        await tx.update(supplierBatches).set({ supplierId: supplier.id }).where(eq(supplierBatches.batchId, batch.id))
        if (input.stockItems) {
          await tx.delete(supplierBatches).where(and(eq(supplierBatches.batchId, batch.id), isNull(supplierBatches.orderId)))
          await insertStockLines(tx, userId, supplier.id, batch.id, input.stockItems)
        }
        if (input.orderIds?.length) await assign(tx, userId, row, input.orderIds)
        await ensureNotEmpty(tx, batch.id)
        return row
      }
      if (!input.orderIds?.length && !input.stockItems?.length) throw new UserError('Agregá productos para reponer o elegí ventas pendientes.')
      const [row] = await tx.insert(productionBatches).values({ id: crypto.randomUUID(), userId, ...values }).returning()
      await insertStockLines(tx, userId, supplier.id, row.id, input.stockItems ?? [])
      if (input.orderIds?.length) await assign(tx, userId, row, input.orderIds)
      return row
    })
  })
}

async function ensureNotEmpty(tx: Tx, batchId: string) {
  const [line] = await tx.select({ id: supplierBatches.id }).from(supplierBatches).where(eq(supplierBatches.batchId, batchId)).limit(1)
  if (!line) throw new UserError('El pedido a fábrica tiene que llevar al menos un producto.')
}

/** Suma ventas pendientes: sus productos pasan a ser líneas del pedido y la venta queda «En fábrica». */
async function assign(tx: Tx, userId: string, batch: typeof productionBatches.$inferSelect, orderIds: string[]) {
  const ids = [...new Set(orderIds)]
  const rows = await tx.select().from(orders).where(and(eq(orders.userId, userId), inArray(orders.id, ids))).for('update')
  if (rows.length !== ids.length) throw new UserError('Una de las ventas no existe.')
  const taken = await tx.select({ orderId: batchOrders.orderId }).from(batchOrders).innerJoin(productionBatches, eq(batchOrders.batchId, productionBatches.id))
    .where(and(eq(batchOrders.userId, userId), inArray(batchOrders.orderId, ids), ne(productionBatches.status, 'received')))
  if (taken.length) throw new UserError('Una de las ventas ya está en otro pedido a fábrica.')
  const items = await tx.select().from(orderItems).where(inArray(orderItems.orderId, ids))
  for (const order of rows) {
    if (order.status !== 'pending' && order.status !== 'in_production') throw new UserError(`La venta ${order.code} no está pendiente.`)
    const own = items.filter((item) => item.orderId === order.id)
    if (!own.length) throw new UserError(`La venta ${order.code} no tiene productos del catálogo para encargar.`)
    await tx.insert(batchOrders).values({ id: crypto.randomUUID(), userId, batchId: batch.id, orderId: order.id })
    for (const item of own) await tx.insert(supplierBatches).values({ id: crypto.randomUUID(), userId, supplierId: batch.supplierId, batchId: batch.id, productId: item.productId, size: item.size, quantity: item.quantity, unitCostCents: item.unitCostCents, orderId: order.id })
    await applyOrderStatus(tx, order, 'in_production')
  }
}

export async function assignOrdersToBatch(input: { batchId: string; orderIds: string[] }) {
  return run(async (userId) => db.transaction(async (tx) => {
    const batch = await lockBatch(tx, userId, input.batchId)
    if (batch.status === 'received') throw new UserError('Ese pedido a fábrica ya se recibió.')
    if (!input.orderIds.length) throw new UserError('Elegí al menos una venta.')
    await assign(tx, userId, batch, input.orderIds)
    return undefined
  }))
}

/** Saca una venta del pedido a fábrica y también sus productos: corrige un encargo que todavía no se mandó. */
export async function removeOrderFromBatch(input: { batchId: string; orderId: string }) {
  return run(async (userId) => db.transaction(async (tx) => {
    const batch = await lockBatch(tx, userId, input.batchId)
    if (batch.status === 'received') throw new UserError('Ese pedido a fábrica ya se recibió.')
    await tx.delete(batchOrders).where(and(eq(batchOrders.userId, userId), eq(batchOrders.batchId, batch.id), eq(batchOrders.orderId, input.orderId)))
    await tx.delete(supplierBatches).where(and(eq(supplierBatches.userId, userId), eq(supplierBatches.batchId, batch.id), eq(supplierBatches.orderId, input.orderId)))
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.userId, userId))).for('update')
    if (order?.status === 'in_production') await applyOrderStatus(tx, order, 'pending')
    return undefined
  }))
}

export async function setBatchStatus(id: string, status: Exclude<BatchStatus, 'received'>) {
  return run(async (userId) => db.transaction(async (tx) => {
    if (!Object.hasOwn(BATCH_STATUS, status) || (status as string) === 'received') throw new UserError('Estado inválido.')
    const batch = await lockBatch(tx, userId, id)
    if (batch.status === 'received') throw new UserError('Ese pedido a fábrica ya se recibió.')
    await tx.update(productionBatches).set({ status }).where(eq(productionBatches.id, id))
    return undefined
  }))
}

/** Borra un pedido a fábrica que todavía no llegó. Sus ventas vuelven a pendientes. */
export async function deleteBatch(id: string) {
  return run(async (userId) => db.transaction(async (tx) => {
    const batch = await lockBatch(tx, userId, id)
    if (batch.status === 'received') throw new UserError('Un pedido ya recibido no se puede borrar: su mercadería ya está en stock.')
    const links = await tx.select().from(batchOrders).where(and(eq(batchOrders.userId, userId), eq(batchOrders.batchId, batch.id)))
    await tx.delete(batchOrders).where(eq(batchOrders.batchId, batch.id))
    await tx.delete(supplierBatches).where(eq(supplierBatches.batchId, batch.id))
    for (const link of links) {
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, link.orderId), eq(orders.userId, userId))).for('update')
      if (order?.status === 'in_production') await applyOrderStatus(tx, order, 'pending')
    }
    await tx.update(expenses).set({ batchId: null }).where(and(eq(expenses.userId, userId), eq(expenses.batchId, batch.id)))
    await tx.delete(productionBatches).where(eq(productionBatches.id, batch.id))
    return undefined
  }))
}

/**
 * Llegó la mercadería: todas las líneas entran al stock. Las ventas del pedido
 * quedan reservadas y listas para entregar. Se puede hacer una sola vez.
 */
export async function receiveBatch(id: string) {
  return run(async (userId) => db.transaction(async (tx) => {
    const batch = await lockBatch(tx, userId, id)
    const key = `batch:${batch.id}`
    const [done] = await tx.select().from(stockReceipts).where(and(eq(stockReceipts.userId, userId), eq(stockReceipts.idempotencyKey, key)))
    if (done || batch.status === 'received') throw new UserError('Ese pedido a fábrica ya se recibió.')

    const lines = await tx.select().from(supplierBatches).where(and(eq(supplierBatches.userId, userId), eq(supplierBatches.batchId, batch.id)))
    if (!lines.length) throw new UserError('Este pedido no tiene mercadería para recibir.')
    for (const line of lines) {
      await changePhysicalStock(tx, userId, line.productId, line.size, line.quantity)
      await tx.insert(stockMovements).values({ id: crypto.randomUUID(), userId, productId: line.productId, size: line.size, batchId: batch.id, type: 'received', quantity: line.quantity, notes: batch.name })
    }
    await tx.update(productionBatches).set({ status: 'received', receivedAt: todayISO() }).where(eq(productionBatches.id, batch.id))

    const links = await tx.select().from(batchOrders).where(and(eq(batchOrders.userId, userId), eq(batchOrders.batchId, batch.id)))
    const linked = links.length ? await tx.select().from(orders).where(and(eq(orders.userId, userId), inArray(orders.id, links.map((link) => link.orderId)))).for('update') : []
    let ready = 0
    for (const order of linked.filter((row) => row.status === 'pending' || row.status === 'in_production')) {
      if ((await reserveIfPossible(tx, order)) === 'ready') ready++
    }
    await tx.insert(stockReceipts).values({ id: crypto.randomUUID(), userId, batchId: batch.id, idempotencyKey: key })
    return { orders: ready, units: lines.reduce((sum, line) => sum + line.quantity, 0) }
  }))
}
