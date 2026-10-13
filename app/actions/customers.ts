'use server'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, orders } from '@/lib/db/schema'
import { clean, ownCustomer, required } from '@/lib/guards'
import { run, UserError } from '@/lib/session'

export type CustomerInput = { id?: string; name: string; phone?: string; email?: string; notes?: string }

export async function saveCustomer(input: CustomerInput) {
  return run(async (userId) => {
    const values = { name: required(input.name, 'El nombre es obligatorio.'), phone: clean(input.phone), email: clean(input.email), notes: clean(input.notes) }
    if (input.id) {
      await ownCustomer(db, userId, input.id)
      const [row] = await db.update(customers).set(values).where(and(eq(customers.id, input.id), eq(customers.userId, userId))).returning()
      return row
    }
    const [row] = await db.insert(customers).values({ id: crypto.randomUUID(), userId, ...values }).returning()
    return row
  })
}

export async function deleteCustomer(id: string) {
  return run(async (userId) => {
    await ownCustomer(db, userId, id)
    const [used] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.customerId, id), eq(orders.userId, userId))).limit(1)
    if (used) throw new UserError('Este cliente tiene pedidos cargados y no se puede borrar.')
    await db.delete(customers).where(and(eq(customers.id, id), eq(customers.userId, userId)))
    return undefined
  })
}
