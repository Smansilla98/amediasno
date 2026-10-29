import { and, eq, inArray, ne } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { batchOrders, orderItems, orders, productionBatches, products, stockMovements, supplierBatches } from '@/lib/db/schema'
import type { OrderStatus } from '@/lib/domain'
import { changePhysicalStock, lockInventory } from '@/lib/inventory'
import { UserError } from '@/lib/session'

type Order = typeof orders.$inferSelect
const sizeKey = (size: string | null | undefined) => size ?? ''

/**
 * Unidades libres de un producto en un talle: stock físico menos lo reservado
 * por ventas listas para entregar (sin contar la venta `exceptOrderId`).
 */
export async function availableStock(tx: Tx, userId: string, productId: string, size: string | null, exceptOrderId?: string) {
  const [product] = await tx.select().from(products).where(and(eq(products.id, productId), eq(products.userId, userId))).for('update')
  if (!product) return { product: null, available: 0 }
  const reserved = await tx.select({ size: orderItems.size, quantity: orderItems.quantity, orderId: orders.id }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.userId, userId), eq(orders.status, 'ready'), eq(orderItems.productId, productId)))
  const held = reserved.filter((row) => sizeKey(row.size) === sizeKey(size) && row.orderId !== exceptOrderId).reduce((sum, row) => sum + row.quantity, 0)
  return { product, available: (product.stockBySize[sizeKey(size)] ?? 0) - held }
}

/** Verifica que haya stock libre para todas las líneas de la venta. Devuelve el faltante como texto, o null. */
export async function missingStock(tx: Tx, order: Order, items: (typeof orderItems.$inferSelect)[]) {
  const need = new Map<string, { productId: string; size: string | null; quantity: number }>()
  for (const item of items) {
    const key = `${item.productId}|${sizeKey(item.size)}`
    const row = need.get(key) ?? { productId: item.productId, size: item.size, quantity: 0 }
    row.quantity += item.quantity
    need.set(key, row)
  }
  for (const row of need.values()) {
    const { product, available } = await availableStock(tx, order.userId, row.productId, row.size, order.id)
    // Al deshacer una entrega, sus unidades vuelven al stock antes de reservarlas.
    const free = available + (order.status === 'delivered' ? row.quantity : 0)
    if (!product || free < row.quantity) return `No hay stock disponible de ${product?.name ?? 'ese producto'}${row.size ? ` talle ${row.size}` : ''}: hay ${Math.max(0, free)} y la venta necesita ${row.quantity}.`
  }
  return null
}

/**
 * Saca la venta del pedido a fábrica abierto en el que esté. Las unidades
 * encargadas siguen en el pedido como reposición de stock: la fábrica ya puede
 * estar produciéndolas y, al recibirlas, entran como stock libre.
 */
async function releaseFromFactory(tx: Tx, order: Order) {
  const open = await tx.select({ batchId: batchOrders.batchId }).from(batchOrders).innerJoin(productionBatches, eq(productionBatches.id, batchOrders.batchId))
    .where(and(eq(batchOrders.userId, order.userId), eq(batchOrders.orderId, order.id), ne(productionBatches.status, 'received')))
  if (!open.length) return
  const ids = open.map((row) => row.batchId)
  await tx.update(supplierBatches).set({ orderId: null }).where(and(eq(supplierBatches.userId, order.userId), eq(supplierBatches.orderId, order.id), inArray(supplierBatches.batchId, ids)))
  await tx.delete(batchOrders).where(and(eq(batchOrders.userId, order.userId), eq(batchOrders.orderId, order.id), inArray(batchOrders.batchId, ids)))
}

/**
 * Cambia el estado de una venta y mantiene el stock coherente:
 * - ready reserva unidades (no las descuenta); delivered las descuenta;
 * - deshacer una entrega devuelve las unidades al stock;
 * - entregar, reservar, volver a pendiente o cancelar una venta que estaba en un
 *   pedido a fábrica la saca de él sin borrar lo encargado (queda como reposición).
 * in_production solo se alcanza al incluir la venta en un pedido a fábrica.
 */
export async function applyOrderStatus(tx: Tx, order: Order, next: OrderStatus) {
  if (order.status === next) return
  await lockInventory(tx, order.userId)
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id))
  if (next === 'in_production') {
    const [link] = await tx.select({ id: batchOrders.id }).from(batchOrders).innerJoin(productionBatches, eq(productionBatches.id, batchOrders.batchId))
      .where(and(eq(batchOrders.userId, order.userId), eq(batchOrders.orderId, order.id), ne(productionBatches.status, 'received')))
    if (!link) throw new UserError('Para mandar una venta a fábrica, sumala a un pedido a fábrica.')
  } else {
    await releaseFromFactory(tx, order)
  }
  if ((next === 'ready' || next === 'delivered') && items.length && order.status !== 'ready') {
    const missing = await missingStock(tx, order, items)
    if (missing) throw new UserError(missing)
  }
  const deliveredSign = Number(next === 'delivered') - Number(order.status === 'delivered')
  if (deliveredSign) {
    for (const item of items) {
      await changePhysicalStock(tx, order.userId, item.productId, item.size, -deliveredSign * item.quantity)
      await tx.insert(stockMovements).values({ id: crypto.randomUUID(), userId: order.userId, productId: item.productId, size: item.size, type: deliveredSign > 0 ? 'delivered' : 'returned', quantity: item.quantity, notes: `Venta ${order.code}` })
    }
  }
  await tx.update(orders).set({ status: next }).where(eq(orders.id, order.id))
}

/** Reserva la venta si alcanza el stock; si no, la deja pendiente. Se usa al recibir mercadería. */
export async function reserveIfPossible(tx: Tx, order: Order) {
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id))
  const next = items.length && !(await missingStock(tx, order, items)) ? 'ready' : 'pending'
  await applyOrderStatus(tx, order, next)
  return next
}
