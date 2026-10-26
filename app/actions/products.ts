'use server'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { products, stockMovements, orders, orderItems } from '@/lib/db/schema'
import { sortSizes, type SizeChart } from '@/lib/domain'
import { amount, clean, ownProduct, required } from '@/lib/guards'
import { changePhysicalStock, lockInventory } from '@/lib/inventory'
import { run, UserError } from '@/lib/session'

export type ProductInput = { id?: string; name: string; category?: string; color?: string; costCents: number; priceCents: number; sizes: string[]; sizeChart?: SizeChart | null; stock?: number; stockSize?: string }

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
    const stock = input.stock ?? 0
    if (!Number.isInteger(stock) || stock < 0) throw new UserError('El stock inicial no puede ser negativo.')
    const stockSize = clean(input.stockSize) ?? ''
    if (stockSize && !sizes.includes(stockSize)) throw new UserError('El talle de stock inicial no es válido.')
    return db.transaction(async (tx) => {
      const [row] = await tx.insert(products).values({ id: crypto.randomUUID(), userId, ...values, stock, stockBySize: { [stockSize]: stock } }).returning()
      if (stock > 0) await tx.insert(stockMovements).values({ id: crypto.randomUUID(), userId, productId: row.id, size: stockSize || null, type: 'adjustment', quantity: stock, notes: 'Stock inicial' })
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

/** Corrige el stock real a mano (conteo, roturas, regalos). `delta` puede ser negativo. */
export async function adjustStock(input: { productId: string; delta: number; size?: string; notes?: string }) {
  return run(async (userId) => {
    if (!Number.isInteger(input.delta) || input.delta === 0) throw new UserError('Indicá cuántas unidades sumar o restar.')
    return db.transaction(async (tx) => {
      await lockInventory(tx, userId)
      const [product] = await tx.select().from(products).where(and(eq(products.id, input.productId), eq(products.userId, userId))).for('update')
      if (!product) throw new UserError('No encontré ese producto.')
      const size = clean(input.size)
      if (size && !product.sizes.includes(size) && !(size in product.stockBySize)) throw new UserError('Talle inválido.')
      const reserved = await tx.select({ item: orderItems }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(and(eq(orders.userId, userId), eq(orders.status, 'ready'), eq(orderItems.productId, product.id)))
      const held = reserved.filter(({ item }) => (item.size ?? '') === (size ?? '')).reduce((sum, { item }) => sum + item.quantity, 0)
      if ((product.stockBySize[size ?? ''] ?? 0) + input.delta < held) throw new UserError('Ese stock está reservado para pedidos listos. Liberá la reserva antes de restarlo.')
      await changePhysicalStock(tx, userId, product.id, size, input.delta)
      await tx.insert(stockMovements).values({ id: crypto.randomUUID(), userId, productId: product.id, size, type: 'adjustment', quantity: input.delta, notes: clean(input.notes) ?? 'Ajuste manual' })
      return undefined
    })
  })
}

/** Clasifica stock legado sin alterar el total físico ni inventar talles. */
export async function classifyStock(input: { productId: string; size: string; quantity: number }) {
  return run(async (userId) => db.transaction(async (tx) => {
    await lockInventory(tx, userId)
    const product = await ownProduct(tx, userId, input.productId)
    if (!product.sizes.includes(input.size)) throw new UserError('Elegí un talle del producto.')
    if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new UserError('Cantidad inválida.')
    const reserved = await tx.select({ item: orderItems }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(and(eq(orders.userId, userId), eq(orders.status, 'ready'), eq(orderItems.productId, product.id)))
    const held = reserved.filter(({ item }) => !item.size).reduce((sum, { item }) => sum + item.quantity, 0)
    if ((product.stockBySize[''] ?? 0) - input.quantity < held) throw new UserError('No hay suficientes unidades sin talle libres para clasificar.')
    await changePhysicalStock(tx, userId, product.id, null, -input.quantity)
    await changePhysicalStock(tx, userId, product.id, input.size, input.quantity)
    await tx.insert(stockMovements).values({ id: crypto.randomUUID(), userId, productId: product.id, size: input.size, type: 'classification', quantity: input.quantity, notes: `Sin talle → ${input.size}` })
    return undefined
  }))
}
