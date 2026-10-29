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
const { saveProduct, updateStock, deleteProduct } = await import('@/app/actions/products')
const { saveBatch, receiveBatch, removeOrderFromBatch, assignOrdersToBatch, deleteBatch } = await import('@/app/actions/production')
const { updateOrder } = await import('@/app/actions/orders')
const { buildView } = await import('@/lib/view')
const { whatsappUrl } = await import('@/lib/whatsapp')
const { importProducts, importCustomers } = await import('@/app/actions/import')
const { parseTable, parseProducts, parseCustomers } = await import('@/lib/import')

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
      // Las tandas viejas guardaban sus productos solo en la venta: se copian como líneas una sola vez.
      await client.query("insert into production_batches (id, user_id, supplier_id, name) values ('b1', 'legacy', 's1', 'Tanda vieja')")
      await client.query("insert into batch_orders (id, user_id, batch_id, order_id) values ('bo1', 'legacy', 'b1', 'o1')")
      await client.query("insert into order_items (id, order_id, product_id, size, quantity, unit_price_cents, unit_cost_cents) values ('i1', 'o1', 'legacy', 'M', 2, 100, 50)")
      await client.query(sql)
      await client.query(sql)
      expect((await client.query("select order_id, quantity, unit_cost_cents from supplier_batches where batch_id='b1'")).rows).toEqual([{ order_id: 'o1', quantity: 2, unit_cost_cents: 50 }])
    } finally { await client.query('rollback'); client.release() }
  })
  test('Pedido mixto reserva la venta al recibir y deja la reposición libre', async () => {
    const first = await order(4)
    const row = await batch({ orderIds: [first.id], stockItems: [{ productId, size: 'M', quantity: 5 }] })
    expect(await state(first.id)).toBe('in_production')
    // Hay 3 M y la venta necesita 4: todavía no se puede entregar.
    expect((await setOrderStatus(first.id, 'delivered')).ok).toBe(false)
    expect((await receiveBatch(row.id)).ok).toBe(true)
    expect(await state(first.id)).toBe('ready'); expect((await stock()).stockBySize.M).toBe(12)
    expect((await setOrderStatus(first.id, 'delivered')).ok).toBe(true)
    expect((await stock()).stockBySize.M).toBe(8)
  })
  test('Venta en fábrica se entrega desde stock sin esperar; lo encargado queda como reposición', async () => {
    const first = await order(2)
    const row = await batch({ orderIds: [first.id] })
    expect(await state(first.id)).toBe('in_production')
    expect((await setOrderStatus(first.id, 'delivered')).ok).toBe(true)
    expect((await stock()).stockBySize.M).toBe(1)
    expect(await db.select().from(schema.batchOrders).where(eq(schema.batchOrders.orderId, first.id))).toHaveLength(0)
    const lines = await db.select().from(schema.supplierBatches).where(eq(schema.supplierBatches.batchId, row.id))
    expect(lines).toHaveLength(1); expect(lines[0]).toMatchObject({ quantity: 2, orderId: null })
    expect((await receiveBatch(row.id))).toMatchObject({ ok: true, data: { orders: 0, units: 2 } })
    expect((await stock()).stockBySize.M).toBe(3)
    expect(await state(first.id)).toBe('delivered')
  })
  test('Borrar un pedido a fábrica devuelve sus ventas a pendientes', async () => {
    const first = await order(2)
    const row = await batch({ orderIds: [first.id], stockItems: [{ productId, size: 'L', quantity: 1 }] })
    expect((await deleteBatch(row.id)).ok).toBe(true)
    expect(await state(first.id)).toBe('pending')
    expect(await db.select().from(schema.supplierBatches).where(eq(schema.supplierBatches.batchId, row.id))).toHaveLength(0)
    expect((await stock()).stock).toBe(5)
  })
  test('Una venta pendiente permite corregir talle y cantidad', async () => {
    const first = await order(1, 'M')
    expect((await updateOrder({ id: first.id, firstName: 'Ana', items: [{ productId, size: 'L', quantity: 2 }] })).ok).toBe(true)
    expect((await setOrderStatus(first.id, 'delivered')).ok).toBe(true)
    expect((await stock()).stockBySize).toEqual({ M: 3, L: 0 })
    expect((await updateOrder({ id: first.id, firstName: 'Ana', items: [{ productId, size: 'M', quantity: 1 }] })).ok).toBe(false)
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
  test('Conteo no puede quitar stock reservado', async () => {
    await order(3, 'M', 'ready')
    expect((await updateStock({ productId, mode: 'set', quantities: { M: 2 } })).ok).toBe(false)
    expect((await stock()).stock).toBe(5)
  })
  test('Ingreso suma por talle y exige talle si el producto los tiene', async () => {
    expect((await updateStock({ productId, mode: 'add', quantities: { M: 2, L: 1 } })).ok).toBe(true)
    expect((await stock()).stockBySize).toEqual({ M: 5, L: 3 })
    expect((await updateStock({ productId, mode: 'add', quantities: { '': 2 } })).ok).toBe(false)
  })
  test('Conteo pasa stock legado a su talle sin cambiar el total', async () => {
    await db.update(products).set({ stock: 5, stockBySize: { '': 5 } }).where(eq(products.id, productId))
    expect((await updateStock({ productId, mode: 'set', quantities: { '': 2, M: 3 } })).ok).toBe(true)
    expect((await stock()).stockBySize).toEqual({ '': 2, M: 3 })
    expect((await stock()).stock).toBe(5)
  })
  test('Solo se borra un producto sin ventas', async () => {
    await order(1)
    expect((await deleteProduct(productId)).ok).toBe(false)
    const other = await saveProduct({ name: 'Sin uso', sizes: [], costCents: 0, priceCents: 100, initialStock: { '': 3 } })
    if (!other.ok) throw new Error(other.error)
    expect((await deleteProduct(other.data.id)).ok).toBe(true)
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
    const result = await saveProduct({ name: 'Otra', sizes: ['M'], costCents: 0, priceCents: 100, initialStock: { M: 2 } })
    expect(result).toMatchObject({ ok: true, data: { stockBySize: { M: 2 } } })
    expect((await createOrder({ customerId, items: [{ productId, size: 'XXL', quantity: 1 }] })).ok).toBe(false)
  })
  test('Importar productos crea nuevos y actualiza existentes sin duplicar', async () => {
    const parsed = parseProducts(parseTable('Producto\tColor\tPrecio\tM\tL\tXL\nMedias\t\t12.000\t10\t\t1\nBuzo\tNegro\t$25.000\t2\t3\t'))
    expect(parsed.issues).toEqual([])
    const result = await importProducts({ items: parsed.items, stockMode: 'set' })
    expect(result).toMatchObject({ ok: true, data: { created: 1, updated: 1, units: 16 } })
    expect(await stock()).toMatchObject({ priceCents: 1200000, sizes: ['M', 'L', 'XL'], stockBySize: { M: 10, L: 2, XL: 1 }, stock: 13 })
    const [buzo] = await db.select().from(products).where(eq(products.name, 'Buzo'))
    expect(buzo).toMatchObject({ userId, color: 'Negro', priceCents: 2500000, sizes: ['M', 'L'], stock: 5 })
    // Reimportar «sumando» agrega; nunca crea un segundo Buzo.
    expect(await importProducts({ items: parsed.items, stockMode: 'add' })).toMatchObject({ ok: true, data: { created: 0, updated: 2 } })
    expect((await db.select().from(products).where(eq(products.userId, userId))).length).toBe(2)
    expect((await stock()).stockBySize).toEqual({ M: 20, L: 2, XL: 2 })
  })
  test('Importar con conteo no deja el stock debajo de lo reservado y es todo o nada', async () => {
    await order(3, 'M', 'ready')
    const result = await importProducts({ items: [{ name: 'Nuevo', sizes: [], stock: { '': 4 } }, { name: 'medias', sizes: ['M'], stock: { M: 1 } }], stockMode: 'set' })
    expect(result.ok).toBe(false)
    expect((await stock()).stockBySize.M).toBe(3)
    expect((await db.select().from(products).where(eq(products.name, 'Nuevo'))).length).toBe(0)
  })
  test('Importar clientes saltea los que ya están', async () => {
    await db.update(customers).set({ phone: '11 5555-1234' }).where(eq(customers.id, customerId))
    const parsed = parseCustomers(parseTable('Nombre;Apellido;Teléfono;Email\nOtro nombre;;+54 9 11 5555 1234;\nAna;Pérez;;ana@mail.com\nAna;Pérez;;'))
    expect(parsed.issues).toEqual([])
    expect(await importCustomers({ items: parsed.items })).toMatchObject({ ok: true, data: { created: 1, skipped: 2 } })
  })
  test('Vista calcula «en camino» solo con pedidos a fábrica, no con ventas pendientes', async () => {
    const first = await order(2)
    await order(1, 'L', 'ready')
    const row = await batch({ stockItems: [{ productId, size: 'L', quantity: 3 }] })
    const w = {
      orders: await db.select().from(orders).where(eq(orders.userId, userId)),
      items: (await db.select({ item: schema.orderItems }).from(schema.orderItems).innerJoin(orders, eq(orders.id, schema.orderItems.orderId)).where(eq(orders.userId, userId))).map((r) => r.item),
      products: [await stock()], customers: [], suppliers: [], batches: await db.select().from(schema.productionBatches).where(eq(schema.productionBatches.userId, userId)),
      stockLines: await db.select().from(schema.supplierBatches).where(eq(schema.supplierBatches.userId, userId)),
      payments: [], expenses: [], accounts: [], movements: [], batchOrders: [], stockMovements: [],
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
test('Lectura de planillas: formatos, errores y columnas', () => {
  expect(parseTable('a,"b, c",d\n\n"x ""y""";2;3')).toEqual([['a', 'b, c', 'd'], ['x "y";2;3']])
  expect(parseTable('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']])
  const long = parseProducts([['Producto', 'Talle', 'Stock', 'Proveedor'], ['Buzo', 'M', '2'], ['Buzo', 'L', '1'], ['Remera', 'S, M', '']])
  expect(long.items).toEqual([{ name: 'Buzo', color: undefined, sizes: ['M', 'L'], stock: { M: 2, L: 1 } }, { name: 'Remera', color: undefined, sizes: ['S', 'M'], stock: {} }])
  expect(long.ignored).toEqual(['Proveedor'])
  const bad = parseProducts([['Nombre', 'Talle', 'Stock', 'Precio'], ['Buzo', 'S, M', '2', ''], ['', 'M', '1', ''], ['Gorro', '', '1,5', 'abc']])
  expect(bad.issues.map((issue) => issue.line)).toEqual([2, 3, 4, 4])
  expect(parseProducts([['Talle'], ['M']]).issues[0].message).toContain('Producto')
  expect(parseProducts([['Producto', 'M', 'Sin talle'], ['Buzo', '1', '2']]).issues[0].message).toContain('talle')
})
