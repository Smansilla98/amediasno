import { and, eq, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { orderItems, orders, products, stockMovements } from '@/lib/db/schema'
import { UserError } from '@/lib/session'

/** Serializa operaciones de stock, ventas y pedidos a fábrica de una cuenta, incluso entre procesos. */
export async function lockInventory(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
}

/** No asignar stock antiguo sin talle a un talle concreto. */
export async function changePhysicalStock(tx: Tx, userId: string, productId: string, size: string | null, delta: number) {
  const [product] = await tx.select().from(products).where(and(eq(products.id, productId), eq(products.userId, userId))).for('update')
  if (!product) throw new UserError('No encontré ese producto.')
  const key = size ?? ''
  const stockBySize = { ...product.stockBySize }
  const next = (stockBySize[key] ?? 0) + delta
  if (next < 0) throw new UserError(`Stock insuficiente de ${product.name}${size ? ` talle ${size}` : ' sin talle'}.`)
  stockBySize[key] = next
  await tx.update(products).set({ stockBySize, stock: Object.values(stockBySize).reduce((sum, quantity) => sum + quantity, 0) }).where(eq(products.id, productId))
}

/** Aplica cantidades por talle a un producto ya bloqueado. Devuelve cuántos talles cambiaron. Lo usa también la importación. */
export async function setStock(tx: Tx, userId: string, product: typeof products.$inferSelect, mode: 'add' | 'set', quantities: Record<string, number>, notes: string) {
  const reserved = await tx.select({ size: orderItems.size, quantity: orderItems.quantity }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.userId, userId), eq(orders.status, 'ready'), eq(orderItems.productId, product.id)))
  let changed = 0
  for (const [size, value] of Object.entries(quantities)) {
    if (!Number.isInteger(value) || value < 0 || value > 100_000) throw new UserError(`Revisá la cantidad de ${product.name}${size ? ` talle ${size}` : ''}.`)
    if (size && !product.sizes.includes(size) && !(size in product.stockBySize)) throw new UserError(`El talle ${size} no es de ${product.name}.`)
    if (!size && product.sizes.length && mode === 'add') throw new UserError(`Elegí el talle de lo que ingresa de ${product.name}.`)
    const current = product.stockBySize[size] ?? 0
    const delta = mode === 'add' ? value : value - current
    if (!delta) continue
    const held = reserved.filter((row) => (row.size ?? '') === size).reduce((sum, row) => sum + row.quantity, 0)
    if (current + delta < held) throw new UserError(`${product.name} ${size ? `talle ${size}` : 'sin talle'}: hay ${held} unidades reservadas para ventas listas, el stock no puede quedar por debajo.`)
    await changePhysicalStock(tx, userId, product.id, size || null, delta)
    await tx.insert(stockMovements).values({ id: crypto.randomUUID(), userId, productId: product.id, size: size || null, type: 'adjustment', quantity: delta, notes })
    changed++
  }
  return changed
}
