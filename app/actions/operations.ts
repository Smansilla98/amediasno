'use server'

import { eq } from 'drizzle-orm'
import { getUserId } from '@/app/actions/orders'
import { db } from '@/lib/db'
import { productionBatches, suppliers } from '@/lib/db/schema'
import { revalidatePath } from 'next/cache'

export async function listSuppliers() {
  const userId = await getUserId()
  return db.select().from(suppliers).where(eq(suppliers.userId, userId))
}

export async function createSupplier(input: { name: string; categories: string[]; contact?: string }) {
  const userId = await getUserId()
  if (!input.name.trim()) throw new Error('El proveedor es obligatorio')
  const [supplier] = await db.insert(suppliers).values({ id: crypto.randomUUID(), userId, name: input.name.trim(), categories: input.categories, contact: input.contact?.trim() }).returning()
  revalidatePath('/')
  return supplier
}

export async function createProductionBatch(input: { supplierId: string; name: string; expectedAt?: string; notes?: string }) {
  const userId = await getUserId()
  if (!input.supplierId || !input.name.trim()) throw new Error('Proveedor y nombre son obligatorios')
  const [batch] = await db.insert(productionBatches).values({ id: crypto.randomUUID(), userId, supplierId: input.supplierId, name: input.name.trim(), expectedAt: input.expectedAt, notes: input.notes?.trim() }).returning()
  revalidatePath('/')
  return batch
}

export async function listBatches() {
  const userId = await getUserId()
  return db.select().from(productionBatches).where(eq(productionBatches.userId, userId))
}
