'use server'

import { asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { batchOrders, cashAccounts, cashMovements, customers, expenses, orderItems, orders, payments, productionBatches, products, suppliers, supplierBatches } from '@/lib/db/schema'
import { requireUserId } from '@/lib/session'

/** Todos los datos del negocio de quien está en sesión. La interfaz arma sus vistas a partir de esto. */
export async function getWorkspace() {
  const userId = await requireUserId()
  const [orderRows, itemRows, customerRows, productRows, paymentRows, expenseRows, accountRows, movementRows, supplierRows, batchRows, batchOrderRows, stockLineRows] = await Promise.all([
    db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)),
    db.select({ item: orderItems }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id)).where(eq(orders.userId, userId)),
    db.select().from(customers).where(eq(customers.userId, userId)).orderBy(customers.name),
    db.select().from(products).where(eq(products.userId, userId)).orderBy(products.name),
    db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.paidAt)),
    db.select().from(expenses).where(eq(expenses.userId, userId)).orderBy(desc(expenses.paidAt)),
    db.select().from(cashAccounts).where(eq(cashAccounts.userId, userId)).orderBy(cashAccounts.createdAt),
    db.select().from(cashMovements).where(eq(cashMovements.userId, userId)).orderBy(desc(cashMovements.occurredAt)),
    db.select().from(suppliers).where(eq(suppliers.userId, userId)).orderBy(suppliers.name),
    db.select().from(productionBatches).where(eq(productionBatches.userId, userId)).orderBy(desc(productionBatches.requestedAt)),
    db.select().from(batchOrders).where(eq(batchOrders.userId, userId)).orderBy(asc(batchOrders.createdAt)),
    db.select().from(supplierBatches).where(eq(supplierBatches.userId, userId)),
  ])
  return {
    orders: orderRows,
    items: itemRows.map((row) => row.item),
    customers: customerRows,
    products: productRows,
    payments: paymentRows,
    expenses: expenseRows,
    accounts: accountRows,
    movements: movementRows,
    suppliers: supplierRows,
    batches: batchRows,
    batchOrders: batchOrderRows,
    stockLines: stockLineRows,
  }
}

export type Workspace = Awaited<ReturnType<typeof getWorkspace>>
