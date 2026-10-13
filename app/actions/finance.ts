'use server'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { cashAccounts, cashMovements, expenses } from '@/lib/db/schema'
import { EXPENSE_CATEGORIES } from '@/lib/domain'
import { amount, clean, ownAccount, ownSupplier, required } from '@/lib/guards'
import { run, UserError } from '@/lib/session'

export async function saveCashAccount(input: { id?: string; name: string; openingBalanceCents?: number }) {
  return run(async (userId) => {
    const values = { name: required(input.name, 'El nombre de la cuenta es obligatorio.'), openingBalanceCents: amount(input.openingBalanceCents ?? 0, 'Revisá el saldo inicial.', { allowZero: true }) }
    if (input.id) {
      await ownAccount(db, userId, input.id)
      const [row] = await db.update(cashAccounts).set(values).where(and(eq(cashAccounts.id, input.id), eq(cashAccounts.userId, userId))).returning()
      return row
    }
    const [row] = await db.insert(cashAccounts).values({ id: crypto.randomUUID(), userId, ...values }).returning()
    return row
  })
}

export async function setCashAccountActive(id: string, active: boolean) {
  return run(async (userId) => {
    await ownAccount(db, userId, id)
    await db.update(cashAccounts).set({ active }).where(and(eq(cashAccounts.id, id), eq(cashAccounts.userId, userId)))
    return undefined
  })
}

export async function createExpense(input: { description: string; amountCents: number; category?: string; supplierId?: string; batchId?: string; accountId?: string; notes?: string }) {
  return run(async (userId) => {
    const description = required(input.description, 'Contá en qué se gastó.')
    const cents = amount(input.amountCents, 'Ingresá el importe del gasto.')
    const category = input.category && input.category in EXPENSE_CATEGORIES ? input.category : 'other'
    if (input.supplierId) await ownSupplier(db, userId, input.supplierId)
    if (input.accountId) await ownAccount(db, userId, input.accountId)
    return db.transaction(async (tx) => {
      const [expense] = await tx.insert(expenses).values({ id: crypto.randomUUID(), userId, description, amountCents: cents, category, supplierId: clean(input.supplierId), batchId: clean(input.batchId), notes: clean(input.notes) }).returning()
      if (input.accountId) await tx.insert(cashMovements).values({ id: crypto.randomUUID(), userId, accountId: input.accountId, type: 'expense', amountCents: cents, description, expenseId: expense.id })
      return expense
    })
  })
}

export async function deleteExpense(id: string) {
  return run(async (userId) => db.transaction(async (tx) => {
    const [expense] = await tx.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    if (!expense) throw new UserError('No encontré ese gasto.')
    await tx.delete(cashMovements).where(and(eq(cashMovements.userId, userId), eq(cashMovements.expenseId, id)))
    await tx.delete(expenses).where(eq(expenses.id, id))
    return undefined
  }))
}

/** Ingreso o egreso suelto de una cuenta (aporte, retiro, ajuste). */
export async function createCashMovement(input: { accountId: string; type: 'income' | 'expense'; amountCents: number; description: string }) {
  return run(async (userId) => {
    const account = await ownAccount(db, userId, required(input.accountId, 'Elegí una cuenta.'))
    if (!account.active) throw new UserError('Esa cuenta está archivada.')
    if (input.type !== 'income' && input.type !== 'expense') throw new UserError('Tipo de movimiento inválido.')
    await db.insert(cashMovements).values({ id: crypto.randomUUID(), userId, accountId: account.id, type: input.type, amountCents: amount(input.amountCents), description: required(input.description, 'Agregá una descripción.') })
    return undefined
  })
}
