'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { customers, orders, payments, products } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function listOrders() {
  const userId = await getUserId()
  return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt))
}

export async function listCustomers() {
  const userId = await getUserId()
  return db.select().from(customers).where(eq(customers.userId, userId)).orderBy(desc(customers.createdAt))
}

export async function listProducts() {
  const userId = await getUserId()
  return db.select().from(products).where(eq(products.userId, userId)).orderBy(desc(products.createdAt))
}

export async function recordPayment(input: { orderId: string; amountCents: number; method: string; notes?: string }) {
  const userId = await getUserId()
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Monto inválido')
  await db.insert(payments).values({ id: crypto.randomUUID(), userId, orderId: input.orderId, amountCents: input.amountCents, method: input.method, notes: input.notes })
  revalidatePath('/')
}
