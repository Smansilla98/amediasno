import { and, eq, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { products } from '@/lib/db/schema'
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