import { sortSizes, STANDARD_SIZES, toCents } from '@/lib/domain'

/**
 * Lectura de planillas para la carga masiva. Sin dependencias: lo usa el
 * navegador para mostrar la vista previa y el servidor vuelve a validar.
 *
 * Productos, en cualquiera de estas dos formas (o mezcladas):
 * - Una fila por producto y una columna por talle (XS, S, M… «Sin talle»).
 * - Una fila por talle, con columnas «Talle» y «Stock».
 * Las filas con el mismo producto y color se juntan.
 */

export type ProductImport = { name: string; category?: string; color?: string; priceCents?: number; costCents?: number; sizes: string[]; stock: Record<string, number> }
export type CustomerImport = { name: string; phone?: string; email?: string; notes?: string }
export type ImportIssue = { line: number; message: string }
export type Parsed<T> = { items: T[]; issues: ImportIssue[]; ignored: string[] }

export const MAX_IMPORT_ROWS = 2000

/** Texto pegado desde Excel o Google Sheets (tabs) o un CSV (coma o punto y coma) → filas. */
export function parseTable(text: string): string[][] {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const first = clean.split('\n', 1)[0] ?? ''
  const delimiter = first.includes('\t') ? '\t' : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < clean.length; index++) {
    const char = clean[index]
    if (quoted) {
      if (char === '"' && clean[index + 1] === '"') { cell += '"'; index++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && !cell) quoted = true
    else if (char === delimiter) { row.push(cell); cell = '' }
    else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += char
  }
  row.push(cell)
  rows.push(row)
  return rows.map((cells) => cells.map((value) => value.trim())).filter((cells) => cells.some(Boolean))
}

const normalize = (header: string) => header.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

const PRODUCT_COLUMNS = {
  name: ['producto', 'nombre', 'articulo', 'descripcion', 'modelo'],
  category: ['categoria', 'rubro', 'tipo'],
  color: ['color'],
  price: ['precio', 'precioventa', 'preciodeventa', 'venta', 'pventa', 'preciounitario'],
  cost: ['costo', 'preciocosto', 'preciodecosto', 'costounitario', 'compra'],
  size: ['talle', 'talles', 'size'],
  stock: ['stock', 'cantidad', 'cant', 'unidades', 'existencia'],
} as const

const CUSTOMER_COLUMNS = {
  name: ['nombre', 'cliente', 'nombreyapellido', 'apellidoynombre', 'nombrecompleto'],
  lastName: ['apellido'],
  phone: ['telefono', 'tel', 'celular', 'cel', 'whatsapp', 'movil'],
  email: ['email', 'mail', 'correo', 'correoelectronico'],
  notes: ['notas', 'nota', 'observaciones', 'comentarios', 'comentario'],
} as const

const NO_SIZE = ['sintalle', 'unico', 'talleunico', 'unidades', 'u']
const SIZE_ALIAS: Record<string, string> = { XXL: '2XL', XXXL: '3XL', XXXXL: '4XL' }

/** Encabezado de una columna de talle: XS…4XL, XXL, talles numéricos (36, 40) o «Sin talle». */
function sizeHeader(header: string): string | null {
  if (NO_SIZE.includes(normalize(header))) return ''
  const upper = header.trim().toUpperCase().replace(/^TALLE\s+/, '')
  const size = SIZE_ALIAS[upper] ?? upper
  if ((STANDARD_SIZES as readonly string[]).includes(size) || /^\d{1,3}$/.test(size)) return size
  return null
}

function mapHeaders<K extends string>(header: string[], columns: Record<K, readonly string[]>) {
  const found: Partial<Record<K, number>> = {}
  const rest: number[] = []
  header.forEach((title, index) => {
    const key = (Object.keys(columns) as K[]).find((name) => columns[name].includes(normalize(title)))
    if (key && found[key] === undefined) found[key] = index
    else rest.push(index)
  })
  return { found, rest }
}

function quantity(value: string): number | null {
  const text = value.replace(/\s/g, '')
  if (!text) return null
  const number = Number(text.replace(/\.(?=\d{3}$)/, ''))
  return Number.isInteger(number) && number >= 0 && number <= 100_000 ? number : NaN
}

function money(value: string | undefined): number | undefined | null {
  if (!value?.trim()) return undefined
  const cents = toCents(value)
  return Number.isInteger(cents) && cents >= 0 && cents <= 2_000_000_000 ? cents : null
}

const splitSizes = (value: string) => value.split(/[,;/|]/).map((size) => size.trim()).filter(Boolean).map((size) => SIZE_ALIAS[size.toUpperCase()] ?? size.slice(0, 12))

export function parseProducts(rows: string[][]): Parsed<ProductImport> {
  const issues: ImportIssue[] = []
  const [header = [], ...body] = rows
  const { found, rest } = mapHeaders(header, PRODUCT_COLUMNS)
  if (found.name === undefined) return { items: [], issues: [{ line: 1, message: 'Falta la columna «Producto» en la primera fila.' }], ignored: [] }
  const sizeColumns = rest.map((index) => ({ index, size: sizeHeader(header[index]) })).filter((column): column is { index: number; size: string } => column.size !== null)
  const ignored = rest.filter((index) => !sizeColumns.some((column) => column.index === index)).map((index) => header[index]).filter(Boolean)
  if (body.length > MAX_IMPORT_ROWS) issues.push({ line: 0, message: `La planilla tiene ${body.length} filas: el máximo por vez es ${MAX_IMPORT_ROWS}.` })

  const byKey = new Map<string, ProductImport & { line: number }>()
  const cell = (row: string[], index: number | undefined) => (index === undefined ? '' : row[index] ?? '').trim()
  body.slice(0, MAX_IMPORT_ROWS).forEach((row, offset) => {
    const line = offset + 2
    const name = cell(row, found.name).slice(0, 120)
    if (!name) { issues.push({ line, message: 'Falta el nombre del producto.' }); return }
    const color = cell(row, found.color).slice(0, 60) || undefined
    const key = `${name.toLowerCase()}|${(color ?? '').toLowerCase()}`
    const item = byKey.get(key) ?? { line, name, color, sizes: [], stock: {} }
    byKey.set(key, item)

    const category = cell(row, found.category).slice(0, 60)
    if (category) item.category = category
    for (const [field, column, label] of [['priceCents', found.price, 'precio'], ['costCents', found.cost, 'costo']] as const) {
      const value = money(cell(row, column))
      if (value === null) issues.push({ line, message: `Revisá el ${label} de ${name}.` })
      else if (value !== undefined) item[field] = value
    }
    const addStock = (size: string, value: number) => { item.stock[size] = (item.stock[size] ?? 0) + value }

    // Formato «Talle + Stock».
    const sizes = splitSizes(cell(row, found.size))
    const stock = quantity(cell(row, found.stock))
    if (Number.isNaN(stock)) issues.push({ line, message: `Revisá el stock de ${name}: tiene que ser un número entero.` })
    else if (stock !== null && sizes.length > 1) issues.push({ line, message: `${name}: para cargar stock poné una fila por talle (o una columna por talle).` })
    else if (stock !== null) addStock(sizes[0] ?? '', stock)
    item.sizes.push(...sizes)

    // Formato «una columna por talle»: la celda con un número (aunque sea 0) suma el talle.
    for (const column of sizeColumns) {
      const value = quantity(cell(row, column.index))
      if (value === null) continue
      if (Number.isNaN(value)) { issues.push({ line, message: `Revisá la cantidad de ${name} en ${header[column.index]}.` }); continue }
      if (column.size) item.sizes.push(column.size)
      addStock(column.size, value)
    }
  })

  const items = [...byKey.values()].map(({ line, ...item }) => {
    item.sizes = sortSizes([...new Set(item.sizes)]).slice(0, 30)
    if (item.sizes.length && item.stock[''] !== undefined) issues.push({ line, message: `${item.name} tiene talles: indicá de qué talle es cada unidad.` })
    return item
  })
  return { items, issues: issues.sort((a, b) => a.line - b.line), ignored }
}

export function parseCustomers(rows: string[][]): Parsed<CustomerImport> {
  const issues: ImportIssue[] = []
  const [header = [], ...body] = rows
  const { found, rest } = mapHeaders(header, CUSTOMER_COLUMNS)
  if (found.name === undefined) return { items: [], issues: [{ line: 1, message: 'Falta la columna «Nombre» en la primera fila.' }], ignored: [] }
  if (body.length > MAX_IMPORT_ROWS) issues.push({ line: 0, message: `La planilla tiene ${body.length} filas: el máximo por vez es ${MAX_IMPORT_ROWS}.` })
  const cell = (row: string[], index: number | undefined) => (index === undefined ? '' : row[index] ?? '').trim()
  const items: CustomerImport[] = []
  body.slice(0, MAX_IMPORT_ROWS).forEach((row, offset) => {
    const name = [cell(row, found.name), cell(row, found.lastName)].filter(Boolean).join(' ').slice(0, 120)
    if (!name) { issues.push({ line: offset + 2, message: 'Falta el nombre del cliente.' }); return }
    const email = cell(row, found.email).slice(0, 120)
    if (email && !/^\S+@\S+\.\S+$/.test(email)) issues.push({ line: offset + 2, message: `Revisá el email de ${name}.` })
    items.push({ name, phone: cell(row, found.phone).slice(0, 40) || undefined, email: email || undefined, notes: cell(row, found.notes).slice(0, 500) || undefined })
  })
  return { items, issues, ignored: rest.map((index) => header[index]).filter(Boolean) }
}

/** Para no duplicar clientes: mismo teléfono (sólo dígitos, últimos 8) o, sin teléfono, mismo nombre. */
export const customerKey = (customer: { name: string; phone?: string | null }) => {
  const digits = (customer.phone ?? '').replace(/\D/g, '')
  return digits.length >= 6 ? `tel:${digits.slice(-8)}` : `nombre:${customer.name.trim().toLowerCase()}`
}

export const productKey = (product: { name: string; color?: string | null }) => `${product.name.trim().toLowerCase()}|${(product.color ?? '').trim().toLowerCase()}`
