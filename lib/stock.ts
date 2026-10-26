import { and, desc, eq, ne, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { batchOrders, orderItems, orders, productionBatches, products, stockMovements } from '@/lib/db/schema'
import type { OrderStatus } from '@/lib/domain'
import { changePhysicalStock, lockInventory } from '@/lib/inventory'
import { UserError } from '@/lib/session'

type Order = typeof orders.$inferSelect

/** Demanda de clientes aún sin abastecer, no un encargo real a fábrica. */
const waiting = (status: string) => status === 'pending' || status === 'in_production'

/**
 * Cambia el estado de un pedido y mantiene el stock coherente:
 * - requestedStock conserva el contador legado de demanda sin abastecer;
 *   la vista de «En fábrica» deriva solamente de las tandas abiertas;
 * - ready reserva, delivered descuenta el talle físico; deshacer devuelve unidades.
 */
export async function applyOrderStatus(tx: Tx, order: Order, next: OrderStatus) {
  if (order.status === next) return
  await lockInventory(tx, order.userId)
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id))
  const [link] = await tx.select({ status: productionBatches.status }).from(batchOrders).innerJoin(productionBatches, eq(batchOrders.batchId, productionBatches.id)).where(and(eq(batchOrders.orderId, order.id), eq(batchOrders.userId, order.userId))).orderBy(desc(batchOrders.createdAt))
  if (next === 'in_production' && (!link || link.status === 'received')) throw new UserError('Elegí el pedido en una tanda para enviarlo a fábrica.')
  if ((next === 'ready' || next === 'delivered') && link && link.status !== 'received') throw new UserError('Primero recibí la tanda, o quitá el pedido de ella para usar stock.')
  if (next === 'pending' && link && link.status !== 'received') throw new UserError('Quitá el pedido de su tanda para volverlo a Tomado.')
  if (next === 'ready' || next === 'delivered') {
    const reserved = await tx.select({ item: orderItems }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(and(eq(orders.userId, order.userId), eq(orders.status, 'ready'), ne(orders.id, order.id)))
    const need = new Map<string, { productId: string; size: string | null; quantity: number }>()
    for (const item of items) {
      const key = `${item.productId}|${item.size ?? ''}`
      const row = need.get(key) ?? { productId: item.productId, size: item.size, quantity: 0 }
      row.quantity += item.quantity
      need.set(key, row)
    }
    for (const row of need.values()) {
      const [product] = await tx.select().from(products).where(and(eq(products.id, row.productId), eq(products.userId, order.userId))).for('update')
      const held = reserved.filter(({ item }) => item.productId === row.productId && (item.size ?? '') === (row.size ?? '')).reduce((sum, { item }) => sum + item.quantity, 0)
      // Al deshacer una entrega, sus unidades vuelven al stock antes de reservarlas.
      const available = (product?.stockBySize[row.size ?? ''] ?? 0) - held + (order.status === 'delivered' ? row.quantity : 0)
      if (!product || available < row.quantity) throw new UserError(`No hay stock disponible suficiente de ${product?.name ?? 'ese producto'}${row.size ? ` talle ${row.size}` : ' sin talle'}.`)
    }
  }
  const requestedSign = Number(waiting(next)) - Number(waiting(order.status))
  const deliveredSign = Number(next === 'delivered') - Number(order.status === 'delivered')
  for (const item of items) {
    if (requestedSign) await tx.update(products).set({ requestedStock: sql`greatest(0, ${products.requestedStock} + ${requestedSign * item.quantity})` }).where(eq(products.id, item.productId))
    if (deliveredSign) {
      await changePhysicalStock(tx, order.userId, item.productId, item.size, -deliveredSign * item.quantity)
      await tx.insert(stockMovements).values({ id: crypto.randomUUID(), userId: order.userId, productId: item.productId, size: item.size, type: deliveredSign > 0 ? 'delivered' : 'returned', quantity: item.quantity, notes: `Pedido ${order.code}` })
    }
  }
  await tx.update(orders).set({ status: next }).where(eq(orders.id, order.id))
}
