'use server'

import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { batchOrders, orderItems, orders, productionBatches, products, stockMovements, stockReceipts, suppliers } from '@/lib/db/schema'
import { BATCH_STATUS, todayISO, type BatchStatus } from '@/lib/domain'
import { clean, lockBatch, ownSupplier, required } from '@/lib/guards'
import { run, UserError } from '@/lib/session'
import { applyOrderStatus } from '@/lib/stock'

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

export async function saveBatch(input: { id?: string; supplierId: string; name: string; expectedAt?: string; notes?: string; orderIds?: string[] }) {
  return run(async (userId) => {
    const supplier = await ownSupplier(db, userId, required(input.supplierId, 'Elegí un proveedor.'))
    const values = { supplierId: supplier.id, name: required(input.name, 'Poné un nombre a la tanda.'), expectedAt: clean(input.expectedAt), notes: clean(input.notes) }
    return db.transaction(async (tx) => {
      if (input.id) {
        await lockBatch(tx, userId, input.id)
        const [row] = await tx.update(productionBatches).set(values).where(eq(productionBatches.id, input.id)).returning()
        return row
      }
      const [row] = await tx.insert(productionBatches).values({ id: crypto.randomUUID(), userId, ...values }).returning()
      if (input.orderIds?.length) await assign(tx, userId, row.id, input.orderIds)
      return row
    })
  })
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function assign(tx: Tx, userId: string, batchId: string, orderIds: string[]) {
  const rows = await tx.select().from(orders).where(and(eq(orders.userId, userId), inArray(orders.id, orderIds))).for('update')
  const taken = await tx.select({ orderId: batchOrders.orderId }).from(batchOrders).where(and(eq(batchOrders.userId, userId), inArray(batchOrders.orderId, orderIds)))
  const already = new Set(taken.map((row) => row.orderId))
  for (const order of rows) {
    if (already.has(order.id)) continue
    if (order.status !== 'pending' && order.status !== 'in_production') throw new UserError(`El pedido ${order.code} ya no está esperando fábrica.`)
    await tx.insert(batchOrders).values({ id: crypto.randomUUID(), userId, batchId, orderId: order.id })
    await applyOrderStatus(tx, order, 'in_production')
  }
}

export async function assignOrdersToBatch(input: { batchId: string; orderIds: string[] }) {
  return run(async (userId) => db.transaction(async (tx) => {
    const batch = await lockBatch(tx, userId, input.batchId)
    if (batch.status === 'received') throw new UserError('Esa tanda ya se recibió.')
    if (!input.orderIds.length) throw new UserError('Elegí al menos un pedido.')
    await assign(tx, userId, batch.id, input.orderIds)
    return undefined
  }))
}

export async function removeOrderFromBatch(input: { batchId: string; orderId: string }) {
  return run(async (userId) => db.transaction(async (tx) => {
    const batch = await lockBatch(tx, userId, input.batchId)
    if (batch.status === 'received') throw new UserError('Esa tanda ya se recibió.')
    await tx.delete(batchOrders).where(and(eq(batchOrders.userId, userId), eq(batchOrders.batchId, batch.id), eq(batchOrders.orderId, input.orderId)))
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.userId, userId))).for('update')
    if (order?.status === 'in_production') await applyOrderStatus(tx, order, 'pending')
    return undefined
  }))
}

export async function setBatchStatus(id: string, status: Exclude<BatchStatus, 'received'>) {
  return run(async (userId) => db.transaction(async (tx) => {
    if (!(status in BATCH_STATUS) || (status as string) === 'received') throw new UserError('Estado inválido.')
    const batch = await lockBatch(tx, userId, id)
    if (batch.status === 'received') throw new UserError('Esa tanda ya se recibió.')
    await tx.update(productionBatches).set({ status }).where(eq(productionBatches.id, id))
    return undefined
  }))
}

/**
 * Llegó la mercadería: entra al stock real todo lo que pedían los pedidos de la
 * tanda y esos pedidos quedan listos para entregar. Se puede llamar una sola vez.
 */
export async function receiveBatch(id: string) {
  return run(async (userId) => db.transaction(async (tx) => {
    const batch = await lockBatch(tx, userId, id)
    const key = `batch:${batch.id}`
    const [done] = await tx.select().from(stockReceipts).where(and(eq(stockReceipts.userId, userId), eq(stockReceipts.idempotencyKey, key)))
    if (done || batch.status === 'received') throw new UserError('Esa tanda ya se recibió.')

    const links = await tx.select().from(batchOrders).where(and(eq(batchOrders.userId, userId), eq(batchOrders.batchId, batch.id)))
    const pending = links.length ? await tx.select().from(orders).where(and(eq(orders.userId, userId), inArray(orders.id, links.map((link) => link.orderId)))).for('update') : []
    const active = pending.filter((order) => order.status === 'pending' || order.status === 'in_production')
    const items = active.length ? await tx.select().from(orderItems).where(inArray(orderItems.orderId, active.map((order) => order.id))) : []

    const byProduct = new Map<string, number>()
    for (const item of items) byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity)
    for (const [productId, quantity] of byProduct) {
      await tx.update(products).set({ stock: sql`${products.stock} + ${quantity}` }).where(and(eq(products.id, productId), eq(products.userId, userId)))
      await tx.insert(stockMovements).values({ id: crypto.randomUUID(), userId, productId, batchId: batch.id, type: 'received', quantity, notes: batch.name })
    }
    for (const order of active) await applyOrderStatus(tx, order, 'ready')

    await tx.insert(stockReceipts).values({ id: crypto.randomUUID(), userId, batchId: batch.id, idempotencyKey: key })
    await tx.update(productionBatches).set({ status: 'received', receivedAt: todayISO() }).where(eq(productionBatches.id, batch.id))
    return { orders: active.length, units: [...byProduct.values()].reduce((sum, quantity) => sum + quantity, 0) }
  }))
}
