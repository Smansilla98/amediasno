'use server'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { orderItems, products, stockMovements, supplierBatches } from '@/lib/db/schema'
import { sortSizes, type SizeChart } from '@/lib/domain'
import { amount, clean, ownProduct, required } from '@/lib/guards'
import { lockInventory, setStock } from '@/lib/inventory'
import { run, UserError } from '@/lib/session'

export type ProductInput = { id?: string; name: string; category?: string; color?: string; costCents: number; priceCents: number; sizes: string[]; sizeChart?: SizeChart | null; initialStock?: Record<string, number> }

/** Deja sólo medidas de talles que el producto tiene, con textos cortos, y descarta la tabla si quedó vacía. */
function cleanChart(chart: SizeChart | null | undefined, sizes: string[]): SizeChart | null {
  if (!chart) return null
  const keep = chart.columns.map((column, index) => ({ name: String(column ?? '').trim().slice(0, 30), index })).filter((column) => column.name).slice(0, 8)
  if (!keep.length) return null
  const rows: SizeChart['rows'] = {}
  for (const size of sizes) rows[size] = keep.map((column) => String(chart.rows?.[size]?.[column.index] ?? '').trim().slice(0, 20))
  return Object.values(rows).some((row) => row.some(Boolean)) ? { columns: keep.map((column) => column.name), rows } : null
}

export async function saveProduct(input: ProductInput) {
  return run(async (userId) => {
    const sizes = sortSizes([...new Set(input.sizes.map((size) => size.trim().slice(0, 12)).filter(Boolean))]).slice(0, 30)
    const values = {
      name: required(input.name, 'El nombre del producto es obligatorio.'),
      category: clean(input.category) ?? 'General',
      color: clean(input.color),
      costCents: amount(input.costCents, 'Revisá el costo.', { allowZero: true }),
      priceCents: amount(input.priceCents, 'Revisá el precio de venta.', { allowZero: true }),
      sizes,
      sizeChart: cleanChart(input.sizeChart, sizes),
    }
    if (input.id) {
      await ownProduct(db, userId, input.id)
      const [row] = await db.update(products).set(values).where(and(eq(products.id, input.id), eq(products.userId, userId))).returning()
      return row
    }
    // Stock inicial por talle (o en «sin talle» si el producto no tiene talles).
    const stockBySize: Record<string, number> = {}
    for (const [size, quantity] of Object.entries(input.initialStock ?? {})) {
      if (!quantity) continue
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100_000) throw new UserError('Revisá el stock inicial.')
      if (sizes.length ? !sizes.includes(size) : size !== '') throw new UserError('El stock inicial tiene un talle que el producto no tiene.')
      stockBySize[size] = quantity
    }
    const stock = Object.values(stockBySize).reduce((sum, quantity) => sum + quantity, 0)
    return db.transaction(async (tx) => {
      const [row] = await tx.insert(products).values({ id: crypto.randomUUID(), userId, ...values, stock, stockBySize }).returning()
      for (const [size, quantity] of Object.entries(stockBySize)) await tx.insert(stockMovements).values({ id: crypto.randomUUID(), userId, productId: row.id, size: size || null, type: 'adjustment', quantity, notes: 'Stock inicial' })
      return row
    })
  })
}

export async function setProductActive(id: string, active: boolean) {
  return run(async (userId) => {
    await ownProduct(db, userId, id)
    await db.update(products).set({ active }).where(and(eq(products.id, id), eq(products.userId, userId)))
    return undefined
  })
}

/** Borra un producto que nunca se usó en ventas ni en pedidos a fábrica. Si ya se usó, se archiva. */
export async function deleteProduct(id: string) {
  return run(async (userId) => db.transaction(async (tx) => {
    await lockInventory(tx, userId)
    const product = await ownProduct(tx, userId, id)
    const [sold] = await tx.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.productId, product.id)).limit(1)
    const [ordered] = await tx.select({ id: supplierBatches.id }).from(supplierBatches).where(eq(supplierBatches.productId, product.id)).limit(1)
    if (sold || ordered) throw new UserError('Este producto ya tiene ventas o pedidos a fábrica: archivalo en lugar de borrarlo.')
    await tx.delete(stockMovements).where(and(eq(stockMovements.userId, userId), eq(stockMovements.productId, product.id)))
    await tx.delete(products).where(eq(products.id, product.id))
    return undefined
  }))
}

/**
 * Carga stock a mano, por talle.
 * - add: suma un ingreso (compra por fuera de un pedido a fábrica, devolución…).
 * - set: corrige al conteo real. Para pasar unidades «sin talle» a un talle,
 *   se pone 0 en «sin talle» y la cantidad en el talle correcto.
 * Nunca deja un talle por debajo de lo reservado para ventas listas.
 */
export async function updateStock(input: { productId: string; mode: 'add' | 'set'; quantities: Record<string, number>; notes?: string }) {
  return run(async (userId) => db.transaction(async (tx) => {
    await lockInventory(tx, userId)
    const [product] = await tx.select().from(products).where(and(eq(products.id, input.productId), eq(products.userId, userId))).for('update')
    if (!product) throw new UserError('No encontré ese producto.')
    const notes = clean(input.notes) ?? (input.mode === 'add' ? 'Ingreso de stock' : 'Conteo de stock')
    const changed = await setStock(tx, userId, product, input.mode, input.quantities, notes)
    if (!changed) throw new UserError(input.mode === 'add' ? 'Indicá cuántas unidades ingresan.' : 'Las cantidades son iguales a las que ya había.')
    return undefined
  }))
}
