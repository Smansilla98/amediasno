import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { eq } from 'drizzle-orm'

if (!process.env.TEST_DATABASE_URL) throw new Error('Definí TEST_DATABASE_URL apuntando a una base de pruebas, nunca producción.')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL

// Solo estas pruebas usan una sesión simulada. Las acciones reales conservan requireUserId.
const userId = `inventory-test-${crypto.randomUUID()}`
class UserError extends Error {}
mock.module('@/lib/session', () => ({
  UserError,
  run: async (fn: (id: string) => Promise<unknown>) => {
    try { return { ok: true, data: await fn(userId) } }
    catch (error) { if (error instanceof UserError) return { ok: false, error: error.message }; throw error }
  },
}))
const { db, pool } = await import('@/lib/db')
const schema = await import('@/lib/db/schema')
const { products, customers, orders, suppliers } = schema
const { createOrder, setOrderStatus } = await import('@/app/actions/orders')
const { saveProduct, adjustStock, classifyStock } = await import('@/app/actions/products')
const { saveBatch, receiveBatch, removeOrderFromBatch, assignOrdersToBatch } = await import('@/app/actions/production')
const { buildView } = await import('@/lib/view')
const { whatsappUrl } = await import('@/lib/whatsapp')

async function cleanup() {
  await db.delete(schema.orderItems).where(eq(schema.orderItems.productId, `${userId}-p`))
  for (const table of [schema.stockReceipts, schema.stockMovements, schema.batchOrders, schema.supplierBatches, schema.payments, schema.productionBatches, orders, products, customers, suppliers]) await db.delete(table).where(eq(table.userId, userId))
}
let productId: string
let customerId: string
let supplierId: string
beforeEach(async () => {
  await cleanup()
  productId = `${userId}-p`; customerId = `${userId}-c`; supplierId = `${userId}-s`
  await db.insert(products).values({ id: productId, userId, name: 'Medias', category: 'Ropa', sizes: ['M', 'L'], stock: 5, stockBySize: { M: 3, L: 2 }, priceCents: 10000 })
  await db.insert(customers).values({ id: customerId, userId, name: 'Cliente prueba' })
  await db.insert(suppliers).values({ id: supplierId, userId, name: 'Fábrica prueba' })
})
afterAll(async () => { await cleanup(); await pool.end() })
async function order(quantity = 1, size = 'M', fulfillment: 'pending' | 'ready' | 'delivered' = 'pending') {
  const result = await createOrder({ customerId, fulfillment, items: [{ productId, size, quantity }] })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return result.data
}
async function stock() { return (await db.select().from(products).where(eq(products.id, productId)))[0] }
async function state(id: string) { return (await db.select().from(orders).where(eq(orders.id, id)))[0].status }
async function batch(input: { orderIds?: string[]; stockItems?: { productId: string; size: string; quantity: number }[] }) {
  const result = await saveBatch({ supplierId, name: 'Tanda prueba', ...input })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return result.data
}

describe('Flujos de inventario (Postgres real)', () => {
  test('Tomar un pedido no lo envía a fábrica ni descuenta stock', async () => {
    const row = await order(2)
    expect(row.status).toBe('pending'); expect((await stock()).stock).toBe(5)
    expect(await db.select().from(schema.batchOrders).where(eq(schema.batchOrders.orderId, row.id))).toHaveLength(0)
    expect((await setOrderStatus(row.id, 'in_production')).ok).toBe(false)
  })
  test('Entrega inmediata descuenta exactamente el talle elegido', async () => {
    const row = await order(2, 'L', 'delivered')
    expect(row.status).toBe('delivered'); expect((await stock()).stockBySize).toEqual({ M: 3, L: 0 })
  })
  test('Reserva mantiene stock físico e impide usar unidades ajenas', async () => {
    const first = await order(2, 'M', 'ready')
    const second = await order(2)
    expect((await stock()).stock).toBe(5)
    expect((await setOrderStatus(second.id, 'delivered')).ok).toBe(false)
    expect((await setOrderStatus(first.id, 'delivered')).ok).toBe(true)
    expect((await stock()).stockBySize.M).toBe(1)
  })
  test('Un talle no se sustituye por otro ni por stock legado', async () => {
    await db.update(products).set({ stock: 12, stockBySize: { '': 10, L: 2 } }).where(eq(products.id, productId))
    const row = await order(1)
    expect((await setOrderStatus(row.id, 'ready')).ok).toBe(false)
    expect((await stock()).stock).toBe(12)
  })
  test('Cancelar libera reservas; deshacer entrega devuelve unidades', async () => {
    const first = await order(3, 'M', 'ready')
    expect((await setOrderStatus(first.id, 'cancelled')).ok).toBe(true)
    const second = await order(3, 'M', 'delivered')
    expect((await stock()).stockBySize.M).toBe(0)
    expect((await setOrderStatus(second.id, 'ready')).ok).toBe(true)
    expect((await stock()).stockBySize.M).toBe(3)
  })
  test('Compra para stock sin pedidos se recibe una sola vez', async () => {
    const row = await batch({ stockItems: [{ productId, size: 'L', quantity: 4 }] })
    expect((await stock()).stock).toBe(5)
    const result = await receiveBatch(row.id)
    expect(result).toMatchObject({ ok: true, data: { orders: 0, units: 4 } })
    expect((await stock()).stockBySize.L).toBe(6)
    expect((await receiveBatch(row.id)).ok).toBe(false)
    expect((await stock()).stock).toBe(9)
  })
  test('Recepciones simultáneas solo ingresan mercadería una vez', async () => {
    const row = await batch({ stockItems: [{ productId, size: 'M', quantity: 2 }] })
    const results = await Promise.all([receiveBatch(row.id), receiveBatch(row.id)])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect((await stock()).stockBySize.M).toBe(5)
  })
  test('Migración conserva stock legado y no pisa talles al repetirse', async () => {
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync(new URL('../lib/db/setup.sql', import.meta.url), 'utf8')
    const client = await pool.connect()
    const schemaName = `migration_${crypto.randomUUID().replaceAll('-', '')}`
    try {
      await client.query('begin')
      await client.query(`create schema ${schemaName}`)
      await client.query(`set local search_path to ${schemaName}`)
      await client.query(sql.split('-- Stock por talle.')[0])
      await client.query("insert into products (id, user_id, name, category, stock) values ('legacy', 'legacy', 'Viejo', 'Medias', 7)")
      await client.query(sql)
      expect((await client.query("select stock_by_size from products where id='legacy'")).rows[0].stock_by_size).toEqual({ '': 7 })
      await client.query("update products set stock_by_size='{" + '"M":7' + "}'::jsonb where id='legacy'")
      await client.query(sql)
      expect((await client.query("select stock, stock_by_size from products where id='legacy'")).rows[0]).toEqual({ stock: 7, stock_by_size: { M: 7 } })
    } finally { await client.query('rollback'); client.release() }
  })
  test('Tanda mixta reserva clientes y deja reposición libre', async () => {
    const first = await order(2)
    const row = await batch({ orderIds: [first.id], stockItems: [{ productId, size: 'M', quantity: 5 }] })
    expect(await state(first.id)).toBe('in_production')
    expect((await setOrderStatus(first.id, 'delivered')).ok).toBe(false)
    expect((await receiveBatch(row.id)).ok).toBe(true)
    expect(await state(first.id)).toBe('ready'); expect((await stock()).stockBySize.M).toBe(10)
    expect((await setOrderStatus(first.id, 'delivered')).ok).toBe(true)
    expect((await stock()).stockBySize.M).toBe(8)
  })
  test('Pedido tomado previamente se entrega desde reposición independiente', async () => {
    const first = await order(5)
    const row = await batch({ stockItems: [{ productId, size: 'M', quantity: 2 }] })
    await receiveBatch(row.id)
    expect(await state(first.id)).toBe('pending')
    expect((await setOrderStatus(first.id, 'delivered')).ok).toBe(true)
    expect((await stock()).stockBySize.M).toBe(0)
  })
  test('Quitar de tanda permite cubrir desde stock sin recibir dos veces', async () => {
    const first = await order(2)
    const row = await batch({ orderIds: [first.id], stockItems: [{ productId, size: 'L', quantity: 1 }] })
    expect((await removeOrderFromBatch({ batchId: row.id, orderId: first.id })).ok).toBe(true)
    expect((await setOrderStatus(first.id, 'delivered')).ok).toBe(true)
    const result = await receiveBatch(row.id)
    expect(result).toMatchObject({ ok: true, data: { units: 1 } })
    expect((await stock()).stockBySize).toEqual({ M: 1, L: 3 })
  })
  test('Cancelar cliente no borra mercadería ya encargada de su tanda', async () => {
    const first = await order(2)
    const row = await batch({ orderIds: [first.id] })
    await setOrderStatus(first.id, 'cancelled')
    expect((await receiveBatch(row.id)).ok).toBe(true)
    expect((await stock()).stockBySize.M).toBe(5)
    expect(await state(first.id)).toBe('cancelled')
  })
  test('Dos entregas simultáneas no sobrevenden stock', async () => {
    const first = await order(2); const second = await order(2)
    const results = await Promise.all([setOrderStatus(first.id, 'delivered'), setOrderStatus(second.id, 'delivered')])
    expect(results.filter((row) => row.ok)).toHaveLength(1)
    expect((await stock()).stockBySize.M).toBe(1)
  })
  test('Ajuste no puede quitar stock reservado', async () => {
    await order(3, 'M', 'ready')
    expect((await adjustStock({ productId, size: 'M', delta: -1 })).ok).toBe(false)
    expect((await stock()).stock).toBe(5)
  })
  test('Clasificar stock legado transfiere talle sin cambiar total', async () => {
    await db.update(products).set({ stock: 5, stockBySize: { '': 5 } }).where(eq(products.id, productId))
    expect((await classifyStock({ productId, size: 'M', quantity: 3 })).ok).toBe(true)
    expect((await stock()).stockBySize).toEqual({ '': 2, M: 3 })
    expect((await stock()).stock).toBe(5)
  })
  test('Validaciones fallidas hacen rollback completo', async () => {
    const count = (await db.select().from(orders).where(eq(orders.userId, userId))).length
    const result = await createOrder({ customerId, fulfillment: 'delivered', items: [{ productId, size: 'M', quantity: 100 }] })
    expect(result.ok).toBe(false)
    expect(await db.select().from(orders).where(eq(orders.userId, userId))).toHaveLength(count)
    expect((await stock()).stock).toBe(5)
    expect((await saveBatch({ supplierId, name: 'Vacía' })).ok).toBe(false)
  })
  test('No se puede asignar un pedido ajeno ni comprar un producto ajeno', async () => {
    const row = await batch({ stockItems: [{ productId, size: 'M', quantity: 1 }] })
    expect((await assignOrdersToBatch({ batchId: row.id, orderIds: ['id-ajeno'] })).ok).toBe(false)
    expect((await saveBatch({ supplierId, name: 'Ajena', stockItems: [{ productId: 'id-ajeno', size: 'M', quantity: 1 }] })).ok).toBe(false)
  })
  test('Pedidos con líneas repetidas suman su necesidad antes de reservar', async () => {
    const result = await createOrder({ customerId, fulfillment: 'ready', items: [{ productId, size: 'M', quantity: 2 }, { productId, size: 'M', quantity: 2 }] })
    expect(result.ok).toBe(false); expect((await stock()).stock).toBe(5)
  })
  test('Inicializar stock por talle y rechazar talles inválidos', async () => {
    const result = await saveProduct({ name: 'Otra', sizes: ['M'], costCents: 0, priceCents: 100, stock: 2, stockSize: 'M' })
    expect(result).toMatchObject({ ok: true, data: { stockBySize: { M: 2 } } })
    expect((await createOrder({ customerId, items: [{ productId, size: 'XXL', quantity: 1 }] })).ok).toBe(false)
  })
  test('Vista calcula fábrica solo con tandas, no con pedidos tomados', async () => {
    const first = await order(2)
    await order(1, 'L', 'ready')
    const row = await batch({ stockItems: [{ productId, size: 'L', quantity: 3 }] })
    const w = {
      orders: await db.select().from(orders).where(eq(orders.userId, userId)),
      items: (await db.select({ item: schema.orderItems }).from(schema.orderItems).innerJoin(orders, eq(orders.id, schema.orderItems.orderId)).where(eq(orders.userId, userId))).map((r) => r.item),
      products: [await stock()], customers: [], suppliers: [], batches: await db.select().from(schema.productionBatches).where(eq(schema.productionBatches.userId, userId)),
      stockLines: await db.select().from(schema.supplierBatches).where(eq(schema.supplierBatches.userId, userId)),
      payments: [], expenses: [], accounts: [], movements: [], batchOrders: [],
    }
    const view = buildView(w)
    expect(view.products[0]).toMatchObject({ stock: 5, availableStock: 4, reservedStock: 1, requestedStock: 3 })
    expect(view.batches[0]).toMatchObject({ id: row.id, units: 3, stockUnits: 3 })
    expect(view.canFulfill(view.orderById.get(first.id)!)).toBe(true)
  })
})

test('Enlaces WhatsApp normalizan AR e internacionales y codifican mensajes', () => {
  expect(whatsappUrl('011 15 5555-5555')).toBe('https://wa.me/5491155555555')
  expect(whatsappUrl('+54 9 11 5555 5555')).toBe('https://wa.me/5491155555555')
  expect(whatsappUrl('+34 612 345 678')).toBe('https://wa.me/34612345678')
  expect(whatsappUrl('contacto@fabrica.com')).toBeNull()
  expect(whatsappUrl('123')).toBeNull()
  expect(whatsappUrl('11 5555 5555', 'Hola & pedido')).toContain('?text=Hola%20%26%20pedido')
})