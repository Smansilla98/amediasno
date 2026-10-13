'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { customers, orders, products, payments, expenses, cashAccounts, cashMovements } from '@/lib/db/schema'
import { desc, eq, sql } from 'drizzle-orm'
import { headers } from 'next/headers'

async function userId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function getDashboardData(section: string) {
  const id = await userId()
  const [orderRows, customerRows, productRows, paymentTotals, expenseTotals, accountRows] = await Promise.all([
    db.select().from(orders).where(eq(orders.userId, id)).orderBy(desc(orders.createdAt)).limit(100),
    db.select().from(customers).where(eq(customers.userId, id)).orderBy(desc(customers.createdAt)).limit(100),
    db.select().from(products).where(eq(products.userId, id)).orderBy(desc(products.createdAt)).limit(100),
    db.select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)` }).from(payments).where(eq(payments.userId, id)),
    db.select({ total: sql<number>`coalesce(sum(${expenses.amountCents}), 0)` }).from(expenses).where(eq(expenses.userId, id)),
    db.select().from(cashAccounts).where(eq(cashAccounts.userId, id)),
  ])
  const sold = orderRows.reduce((sum, row) => sum + row.totalCents, 0)
  const paid = orderRows.reduce((sum, row) => sum + row.paidCents, 0)
  const stock = productRows.reduce((sum, row) => sum + row.stock, 0)
  const requested = productRows.reduce((sum, row) => sum + row.requestedStock, 0)
  const cash = accountRows.reduce((sum, account) => sum + account.openingBalanceCents, 0) + Number(paymentTotals[0]?.total ?? 0) - Number(expenseTotals[0]?.total ?? 0)
  const rows = section === 'Clientes' ? customerRows.map((row) => [row.name, row.email ?? row.phone ?? 'Sin contacto', '', '', 'Activo']) : section === 'Catálogo' ? productRows.map((row) => [row.name, row.category, `$${(row.costCents / 100).toLocaleString('es-AR')}`, `$${(row.priceCents / 100).toLocaleString('es-AR')}`, `${row.stock} u.`]) : orderRows.map((row) => [row.code, `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(), row.size ?? '—', `$${(row.totalCents / 100).toLocaleString('es-AR')}`, row.paymentStatus])
  return { stats: section === 'Clientes' ? [['Clientes', String(customerRows.length), 'Datos reales'], ['Pedidos', String(orderRows.length), 'Relacionados'], ['Ticket promedio', orderRows.length ? `$${Math.round(sold / orderRows.length / 100).toLocaleString('es-AR')}` : '$0', 'Calculado']] : section === 'Catálogo' ? [['Productos activos', String(productRows.filter((row) => row.active).length), 'Datos reales'], ['Stock real', `${stock} u.`, 'Inventario'], ['Solicitado', `${requested} u.`, 'Fábrica']] : [['Pedidos', String(orderRows.length), 'Datos reales'], ['Cobrado', `$${(paid / 100).toLocaleString('es-AR')}`, 'Señas y pagos'], ['Por cobrar', `$${((sold - paid) / 100).toLocaleString('es-AR')}`, 'Saldo']], rows, cash: { income: Number(paymentTotals[0]?.total ?? 0), expenses: Number(expenseTotals[0]?.total ?? 0), balance: cash } }
}

export async function dashboardJson(section: string) { return getDashboardData(section) }

export { sql }

void dashboardJson
void eq
void payments
void cashMovements
