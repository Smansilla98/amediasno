'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { customers, orderItems, orders, payments, products, stockMovements, expenses, cashAccounts, cashMovements } from '@/lib/db/schema'
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

export async function createOrder(input: { customerId: string; code: string; totalCents: number; depositCents: number; firstName: string; lastName: string; size?: string; block?: string; professor?: string; venue?: string; notes?: string; deliveryDate?: string; productId?: string; quantity?: number }) {
  const userId = await getUserId()
  if (!input.customerId || !input.code.trim() || !input.firstName.trim() || !input.lastName.trim() || input.totalCents <= 0 || input.depositCents < 0 || input.depositCents > input.totalCents) throw new Error('Completá los datos del pedido y verificá la seña')
  const quantity = input.quantity ?? 1
  let product: typeof products.$inferSelect | undefined
  if (input.productId) {
    const [found] = await db.select().from(products).where(eq(products.id, input.productId))
    if (!found || found.userId !== userId || !found.active) throw new Error('Producto inválido')
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Cantidad inválida')
    product = found
  }
  const order = { id: crypto.randomUUID(), userId, customerId: input.customerId, code: input.code.trim(), firstName: input.firstName.trim(), lastName: input.lastName.trim(), size: input.size?.trim(), block: input.block?.trim(), professor: input.professor?.trim(), venue: input.venue?.trim(), totalCents: input.totalCents, depositCents: input.depositCents, paidCents: input.depositCents, notes: input.notes?.trim(), deliveryDate: input.deliveryDate, status: 'pending', paymentStatus: input.depositCents >= input.totalCents ? 'paid' : input.depositCents > 0 ? 'partial' : 'pending' }
  await db.transaction(async (tx) => {
    await tx.insert(orders).values(order)
    if (product) {
      await tx.insert(orderItems).values({ id: crypto.randomUUID(), orderId: order.id, productId: product.id, size: input.size, quantity, unitPriceCents: product.priceCents, unitCostCents: product.costCents })
      await tx.update(products).set({ requestedStock: product.requestedStock + quantity }).where(eq(products.id, product.id))
      await tx.insert(stockMovements).values({ id: crypto.randomUUID(), userId, productId: product.id, type: 'requested', quantity, notes: `Pedido ${order.code}` })
    }
  })
  revalidatePath('/')
  return order
}

export async function recordPayment(input: { orderId: string; amountCents: number; method: string; notes?: string }) {
  const userId = await getUserId()
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Monto inválido')
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId))
  if (!order || order.userId !== userId || input.amountCents > order.totalCents - order.paidCents) throw new Error('Pago inválido')
  const paid = order.paidCents + input.amountCents
  await db.transaction(async (tx) => {
    await tx.insert(payments).values({ id: crypto.randomUUID(), userId, orderId: input.orderId, amountCents: input.amountCents, method: input.method, notes: input.notes })
    await tx.update(orders).set({ paidCents: paid, paymentStatus: paid >= order.totalCents ? 'paid' : 'partial' }).where(eq(orders.id, input.orderId))
  })
  revalidatePath('/')
}

export async function updateCustomer(input: { id: string; name: string; phone?: string; email?: string }) {
  const userId = await getUserId()
  if (!input.name.trim()) throw new Error('El nombre es obligatorio')
  const [existing] = await db.select().from(customers).where(eq(customers.id, input.id))
  if (!existing || existing.userId !== userId) throw new Error('Cliente no encontrado')
  const [updated] = await db.update(customers).set({ name: input.name.trim(), phone: input.phone?.trim(), email: input.email?.trim() }).where(eq(customers.id, input.id)).returning()
  revalidatePath('/')
  return updated
}

export async function updateProduct(input: { id: string; name: string; category: string; color?: string; costCents: number; priceCents: number; sizes: string[] }) {
  const userId = await getUserId()
  if (!input.name.trim() || input.costCents < 0 || input.priceCents < 0) throw new Error('Datos de producto inválidos')
  const [existing] = await db.select().from(products).where(eq(products.id, input.id))
  if (!existing || existing.userId !== userId) throw new Error('Producto no encontrado')
  const [updated] = await db.update(products).set({ name: input.name.trim(), category: input.category.trim() || 'General', color: input.color?.trim(), costCents: input.costCents, priceCents: input.priceCents, sizes: input.sizes }).where(eq(products.id, input.id)).returning()
  revalidatePath('/')
  return updated
}

export async function deactivateProduct(id: string) {
  const userId = await getUserId()
  const [existing] = await db.select().from(products).where(eq(products.id, id))
  if (!existing || existing.userId !== userId) throw new Error('Producto no encontrado')
  const [updated] = await db.update(products).set({ active: false }).where(eq(products.id, id)).returning()
  revalidatePath('/')
  return updated
}

export async function cancelOrder(id: string) {
  const userId = await getUserId()
  const [existing] = await db.select().from(orders).where(eq(orders.id, id))
  if (!existing || existing.userId !== userId) throw new Error('Pedido no encontrado')
  if (existing.status === 'delivered' || existing.status === 'cancelled') throw new Error('El pedido no puede cancelarse')
  const [updated] = await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, id)).returning()
  revalidatePath('/')
  return updated
}

export async function exportOrders(format: 'json' | 'csv') {
  const userId = await getUserId()
  const rows = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt))
  if (format === 'json') return JSON.stringify(rows)
  const headers = ['id','code','customerId','status','paymentStatus','totalCents','paidCents','deliveryDate','createdAt']
  return [headers.join(','), ...rows.map((row) => headers.map((key) => JSON.stringify(row[key as keyof typeof row] ?? '')).join(','))].join('\n')
}
