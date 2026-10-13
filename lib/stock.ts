import { eq, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { orderItems, orders, products, stockMovements } from '@/lib/db/schema'
import type { OrderStatus } from '@/lib/domain'

type Order = typeof orders.$inferSelect

/** Un pedido "espera fábrica" mientras no llegó la mercadería. */
const waiting = (status: string) => status === 'pending' || status === 'in_production'

/**
 * Cambia el estado de un pedido y mantiene el stock coherente:
 * - mientras espera fábrica, sus unidades cuentan como "solicitadas";
 * - al entregarse salen del stock real, y vuelven si se deshace la entrega.
 */
export async function applyOrderStatus(tx: Tx, order: Order, next: OrderStatus) {
  if (order.status === next) return
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id))
  const requestedSign = Number(waiting(next)) - Number(waiting(order.status))
  const deliveredSign = Number(next === 'delivered') - Number(order.status === 'delivered')
  for (const item of items) {
    if (requestedSign) await tx.update(products).set({ requestedStock: sql`greatest(0, ${products.requestedStock} + ${requestedSign * item.quantity})` }).where(eq(products.id, item.productId))
    if (deliveredSign) {
      await tx.update(products).set({ stock: sql`greatest(0, ${products.stock} - ${deliveredSign * item.quantity})` }).where(eq(products.id, item.productId))
      await tx.insert(stockMovements).values({ id: crypto.randomUUID(), userId: order.userId, productId: item.productId, type: deliveredSign > 0 ? 'delivered' : 'returned', quantity: item.quantity, notes: `Pedido ${order.code}` })
    }
  }
  await tx.update(orders).set({ status: next }).where(eq(orders.id, order.id))
}
