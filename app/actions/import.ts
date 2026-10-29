'use server'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, products, stockMovements } from '@/lib/db/schema'
import { sortSizes } from '@/lib/domain'
import { amount } from '@/lib/guards'
import { customerKey, MAX_IMPORT_ROWS, productKey, type CustomerImport, type ProductImport } from '@/lib/import'
import { lockInventory, setStock } from '@/lib/inventory'
import { run, UserError } from '@/lib/session'

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '') || null

/**
 * Carga masiva de productos con su stock. Si el producto (mismo nombre y color)
 * ya existe, actualiza precio, costo y categoría cuando vienen, suma talles nuevos
 * y aplica el stock: `set` lo deja en la cantidad de la planilla, `add` la suma.
 * Todo o nada: si una fila falla no se guarda ninguna.
 */
export async function importProducts(input: { items: ProductImport[]; stockMode: 'add' | 'set' }) {
  return run(async (userId) => {
    if (!Array.isArray(input.items) || !input.items.length) throw new UserError('La planilla no tiene productos.')
    if (input.items.length > MAX_IMPORT_ROWS) throw new UserError(`Se pueden importar hasta ${MAX_IMPORT_ROWS} productos por vez.`)
    if (input.stockMode !== 'add' && input.stockMode !== 'set') throw new UserError('Elegí cómo cargar el stock.')
    return db.transaction(async (tx) => {
      await lockInventory(tx, userId)
      const existing = new Map((await tx.select().from(products).where(eq(products.userId, userId))).map((row) => [productKey(row), row]))
      const seen = new Set<string>()
      let created = 0, updated = 0, units = 0
      for (const raw of input.items) {
        const name = text(raw.name, 120)
        if (!name) throw new UserError('Hay un producto sin nombre.')
        const color = text(raw.color, 60)
        const key = productKey({ name, color })
        if (seen.has(key)) throw new UserError(`${name} aparece dos veces.`)
        seen.add(key)
        const sizes = sortSizes([...new Set((raw.sizes ?? []).map((size) => text(size, 12)).filter((size): size is string => !!size))]).slice(0, 30)
        const stock: Record<string, number> = {}
        for (const [size, quantity] of Object.entries(raw.stock ?? {})) {
          if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100_000) throw new UserError(`Revisá el stock de ${name}.`)
          if (size ? !sizes.includes(size) : sizes.length > 0) throw new UserError(`${name}: indicá de qué talle es cada unidad.`)
          stock[size] = quantity
        }
        const priceCents = raw.priceCents === undefined ? undefined : amount(raw.priceCents, `Revisá el precio de ${name}.`, { allowZero: true })
        const costCents = raw.costCents === undefined ? undefined : amount(raw.costCents, `Revisá el costo de ${name}.`, { allowZero: true })
        const category = text(raw.category, 60)
        units += Object.values(stock).reduce((sum, quantity) => sum + quantity, 0)

        const current = existing.get(key)
        if (current) {
          const merged = sortSizes([...new Set([...current.sizes, ...sizes])])
          const [row] = await tx.update(products).set({ active: true, sizes: merged, ...(category && { category }), ...(priceCents !== undefined && { priceCents }), ...(costCents !== undefined && { costCents }) }).where(eq(products.id, current.id)).returning()
          await setStock(tx, userId, row, input.stockMode, stock, 'Importación de planilla')
          updated++
          continue
        }
        const total = Object.values(stock).reduce((sum, quantity) => sum + quantity, 0)
        const [row] = await tx.insert(products).values({ id: crypto.randomUUID(), userId, name, color, category: category ?? 'General', priceCents: priceCents ?? 0, costCents: costCents ?? 0, sizes, stock: total, stockBySize: stock }).returning()
        for (const [size, quantity] of Object.entries(stock)) {
          if (quantity) await tx.insert(stockMovements).values({ id: crypto.randomUUID(), userId, productId: row.id, size: size || null, type: 'adjustment', quantity, notes: 'Importación de planilla' })
        }
        created++
      }
      return { created, updated, units }
    })
  })
}

/** Carga masiva de clientes. Saltea los que ya están (mismo teléfono o, sin teléfono, mismo nombre). */
export async function importCustomers(input: { items: CustomerImport[] }) {
  return run(async (userId) => {
    if (!Array.isArray(input.items) || !input.items.length) throw new UserError('La planilla no tiene clientes.')
    if (input.items.length > MAX_IMPORT_ROWS) throw new UserError(`Se pueden importar hasta ${MAX_IMPORT_ROWS} clientes por vez.`)
    return db.transaction(async (tx) => {
      const known = new Set((await tx.select({ name: customers.name, phone: customers.phone }).from(customers).where(eq(customers.userId, userId))).map(customerKey))
      let created = 0, skipped = 0
      for (const raw of input.items) {
        const name = text(raw.name, 120)
        if (!name) throw new UserError('Hay un cliente sin nombre.')
        const values = { name, phone: text(raw.phone, 40), email: text(raw.email, 120), notes: text(raw.notes, 500) }
        const key = customerKey(values)
        if (known.has(key)) { skipped++; continue }
        known.add(key)
        await tx.insert(customers).values({ id: crypto.randomUUID(), userId, ...values })
        created++
      }
      return { created, skipped }
    })
  })
}
