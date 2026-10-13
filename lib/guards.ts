import { and, eq } from 'drizzle-orm'
import { db, type Tx } from '@/lib/db'
import { cashAccounts, customers, orders, productionBatches, products, suppliers } from '@/lib/db/schema'
import { UserError } from '@/lib/session'

type Conn = typeof db | Tx

// Cada búsqueda filtra por dueño: un id ajeno se comporta igual que uno inexistente.
export async function ownCustomer(conn: Conn, userId: string, id: string) {
  const [row] = await conn.select().from(customers).where(and(eq(customers.id, id), eq(customers.userId, userId)))
  if (!row) throw new UserError('No encontré ese cliente.')
  return row
}
export async function ownProduct(conn: Conn, userId: string, id: string) {
  const [row] = await conn.select().from(products).where(and(eq(products.id, id), eq(products.userId, userId)))
  if (!row) throw new UserError('No encontré ese producto.')
  return row
}
/** Bloquea la fila del pedido hasta que termine la transacción. */
export async function lockOrder(tx: Tx, userId: string, id: string) {
  const [row] = await tx.select().from(orders).where(and(eq(orders.id, id), eq(orders.userId, userId))).for('update')
  if (!row) throw new UserError('No encontré ese pedido.')
  return row
}
export async function ownAccount(conn: Conn, userId: string, id: string) {
  const [row] = await conn.select().from(cashAccounts).where(and(eq(cashAccounts.id, id), eq(cashAccounts.userId, userId)))
  if (!row) throw new UserError('No encontré esa cuenta.')
  return row
}
export async function ownSupplier(conn: Conn, userId: string, id: string) {
  const [row] = await conn.select().from(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.userId, userId)))
  if (!row) throw new UserError('No encontré ese proveedor.')
  return row
}
export async function lockBatch(tx: Tx, userId: string, id: string) {
  const [row] = await tx.select().from(productionBatches).where(and(eq(productionBatches.id, id), eq(productionBatches.userId, userId))).for('update')
  if (!row) throw new UserError('No encontré esa tanda.')
  return row
}

export const clean = (value: string | null | undefined) => {
  const text = (value ?? '').trim()
  return text ? text : null
}
export function required(value: string | null | undefined, message: string) {
  const text = (value ?? '').trim()
  if (!text) throw new UserError(message)
  return text
}
export function amount(value: number, message = 'Ingresá un importe válido.', { allowZero = false } = {}) {
  if (!Number.isInteger(value) || value < 0 || (!allowZero && value === 0) || value > 2_000_000_000) throw new UserError(message)
  return value
}
