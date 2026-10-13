'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cashAccounts, cashMovements, expenses } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function createCashAccount(input: { name: string; openingBalanceCents?: number }) {
  const userId = await getUserId()
  if (!input.name.trim()) throw new Error('El nombre de la cuenta es obligatorio')
  const account = { id: crypto.randomUUID(), userId, name: input.name.trim(), openingBalanceCents: input.openingBalanceCents ?? 0, active: true }
  await db.insert(cashAccounts).values(account)
  revalidatePath('/')
  return account
}

export async function createExpense(input: { description: string; amountCents: number; category?: string; supplierId?: string; accountId?: string }) {
  const userId = await getUserId()
  if (!input.description.trim() || !Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Completá una descripción y un importe válido')
  const expense = { id: crypto.randomUUID(), userId, description: input.description.trim(), amountCents: input.amountCents, category: input.category ?? 'factory', supplierId: input.supplierId, paidAt: new Date() }
  await db.insert(expenses).values(expense)
  if (input.accountId) await db.insert(cashMovements).values({ id: crypto.randomUUID(), userId, accountId: input.accountId, type: 'expense', amountCents: input.amountCents, description: input.description.trim(), expenseId: expense.id })
  revalidatePath('/')
  return expense
}

export async function listFinance() {
  const userId = await getUserId()
  const [accounts, movements, expenseRows] = await Promise.all([
    db.select().from(cashAccounts).where(eq(cashAccounts.userId, userId)).orderBy(desc(cashAccounts.createdAt)),
    db.select().from(cashMovements).where(eq(cashMovements.userId, userId)).orderBy(desc(cashMovements.occurredAt)),
    db.select().from(expenses).where(eq(expenses.userId, userId)).orderBy(desc(expenses.paidAt)),
  ])
  return { accounts, movements, expenses: expenseRows }
}
