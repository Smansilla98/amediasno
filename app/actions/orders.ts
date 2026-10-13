'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { customers, orderItems, orders, payments, products } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function listOrders() { const userId = await getUserId(); return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)) }
export async function listCustomers() { const userId = await getUserId(); return db.select().from(customers).where(eq(customers.userId, userId)).orderBy(desc(customers.createdAt)) }
export async function listProducts() { const userId = await getUserId(); return db.select().from(products).where(eq(products.userId, userId)).orderBy(desc(products.createdAt)) }

export async function createProduct(input: { name: string; category: string; color?: string; costCents: number; priceCents: number; sizes: string[]; stock: number }) {
  const userId = await getUserId()
  if (!input.name.trim() || input.priceCents < 0 || input.costCents < 0 || input.stock < 0) throw new Error('Datos de producto inválidos')
  const product = { id: crypto.randomUUID(), userId, name: input.name.trim(), category: input.category.trim() || 'General', color: input.color?.trim(), costCents: input.costCents, priceCents: input.priceCents, sizes: input.sizes, stock: input.stock, active: true }
  await db.insert(products).values(product)
  revalidatePath('/')
  return product
}

export async function createCustomer(input: { name: string; phone?: string; email?: string }) {
  const userId = await getUserId()
  if (!input.name.trim()) throw new Error('El nombre es obligatorio')
  const customer = { id: crypto.randomUUID(), userId, name: input.name.trim(), phone: input.phone?.trim(), email: input.email?.trim() }
  await db.insert(customers).values(customer)
  revalidatePath('/')
  return customer
}

export async function createOrder(input: { customerId: string; code: string; totalCents: number; notes?: string; deliveryDate?: string }) {
  const userId = await getUserId()
  if (!input.customerId || !input.code.trim() || input.totalCents <= 0) throw new Error('Completá los datos del pedido')
  const order = { id: crypto.randomUUID(), userId, customerId: input.customerId, code: input.code.trim(), totalCents: input.totalCents, notes: input.notes?.trim(), deliveryDate: input.deliveryDate, status: 'pending', paymentStatus: 'pending', paidCents: 0 }
  await db.insert(orders).values(order)
  revalidatePath('/')
  return order
}

export async function recordPayment(input: { orderId: string; amountCents: number; method: string; notes?: string }) {
  const userId = await getUserId()
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Monto inválido')
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId))
  if (!order || order.userId !== userId || input.amountCents > order.totalCents - order.paidCents) throw new Error('Pago inválido')
  const paid = order.paidCents + input.amountCents
  await db.insert(payments).values({ id: crypto.randomUUID(), userId, orderId: input.orderId, amountCents: input.amountCents, method: input.method, notes: input.notes })
  await db.update(orders).set({ paidCents: paid, paymentStatus: paid >= order.totalCents ? 'paid' : 'partial' }).where(eq(orders.id, input.orderId))
  revalidatePath('/')
}

export async function exportOrders(format: 'json' | 'csv') {
  const userId = await getUserId()
  const rows = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt))
  if (format === 'json') return JSON.stringify(rows)
  const headers = ['id','code','customerId','status','paymentStatus','totalCents','paidCents','deliveryDate','createdAt']
  return [headers.join(','), ...rows.map((row) => headers.map((key) => JSON.stringify(row[key as keyof typeof row] ?? '')).join(','))].join('\n')
}
