import type { Workspace } from '@/app/actions/workspace'
import { fullName, monthKey } from '@/lib/domain'

/** Datos derivados que usan las pantallas. Función pura: se recalcula cuando cambia el workspace. */
export function buildView(w: Workspace) {
  const customerById = new Map(w.customers.map((row) => [row.id, row]))
  const productById = new Map(w.products.map((row) => [row.id, row]))
  const supplierById = new Map(w.suppliers.map((row) => [row.id, row]))
  const accountById = new Map(w.accounts.map((row) => [row.id, row]))
  const batchById = new Map(w.batches.map((row) => [row.id, row]))
  const batchIdByOrder = new Map(w.batchOrders.map((link) => [link.orderId, link.batchId]))

  const itemsByOrder = new Map<string, ReturnType<typeof line>[]>()
  function line(item: Workspace['items'][number]) {
    const product = productById.get(item.productId)
    return { ...item, name: product?.name ?? 'Producto eliminado', color: product?.color ?? null, category: product?.category ?? null }
  }
  for (const item of w.items) {
    const list = itemsByOrder.get(item.orderId) ?? []
    list.push(line(item))
    itemsByOrder.set(item.orderId, list)
  }

  const orders = w.orders.map((order) => {
    const items = itemsByOrder.get(order.id) ?? []
    const batch = batchById.get(batchIdByOrder.get(order.id) ?? '') ?? null
    const customer = customerById.get(order.customerId)
    return {
      ...order,
      items,
      batch,
      customerName: customer?.name ?? 'Cliente eliminado',
      customerPhone: customer?.phone ?? null,
      recipient: fullName(order.firstName, order.lastName),
      units: items.reduce((sum, item) => sum + item.quantity, 0),
      costCents: items.reduce((sum, item) => sum + item.unitCostCents * item.quantity, 0),
      balanceCents: order.status === 'cancelled' ? 0 : Math.max(0, order.totalCents - order.paidCents),
      summary: items.map((item) => `${item.quantity}× ${item.name}${item.size ? ` ${item.size}` : ''}`).join(' · ') || (order.size ? `Talle ${order.size}` : 'Sin productos'),
    }
  })
  const orderById = new Map(orders.map((row) => [row.id, row]))
  const live = orders.filter((order) => order.status !== 'cancelled')

  const customers = w.customers.map((customer) => {
    const own = live.filter((order) => order.customerId === customer.id)
    return { ...customer, orderCount: own.length, totalCents: own.reduce((s, o) => s + o.totalCents, 0), balanceCents: own.reduce((s, o) => s + o.balanceCents, 0) }
  })

  const reservedItems = orders.filter((order) => order.status === 'ready').flatMap((order) => order.items)
  const availableFor = (productId: string, size: string | null, excludeOrderId?: string) => {
    const product = productById.get(productId)
    const held = reservedItems.filter((item) => item.productId === productId && (item.size ?? '') === (size ?? '') && item.orderId !== excludeOrderId).reduce((sum, item) => sum + item.quantity, 0)
    return (product?.stockBySize[size ?? ''] ?? 0) - held
  }
  const canFulfill = (order: typeof orders[number]) => {
    if (!order.items.length || !['pending', 'ready'].includes(order.status) || (order.batch && order.batch.status !== 'received')) return false
    const quantities = new Map<string, number>()
    for (const item of order.items) {
      const key = `${item.productId}|${item.size ?? ''}`
      const need = (quantities.get(key) ?? 0) + item.quantity
      quantities.set(key, need)
      if (availableFor(item.productId, item.size, order.id) < need) return false
    }
    return true
  }
  const products = w.products.map((product) => {
    const sold = live.flatMap((order) => order.items).filter((item) => item.productId === product.id)
    const revenueCents = sold.reduce((s, item) => s + item.unitPriceCents * item.quantity, 0)
    const costCents = sold.reduce((s, item) => s + item.unitCostCents * item.quantity, 0)
    return {
      ...product,
      reservedStock: reservedItems.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0),
      availableStock: Object.keys(product.stockBySize).reduce((sum, size) => sum + Math.max(0, availableFor(product.id, size)), 0),
      inventory: [...new Set([...product.sizes, ...Object.keys(product.stockBySize)])].map((size) => ({ size, stock: product.stockBySize[size] ?? 0, available: availableFor(product.id, size), reserved: reservedItems.filter((item) => item.productId === product.id && (item.size ?? '') === size).reduce((sum, item) => sum + item.quantity, 0) })),
      requestedStock: w.items.filter((item) => item.productId === product.id && w.batchOrders.some((link) => link.orderId === item.orderId && batchById.get(link.batchId)?.status !== 'received')).reduce((sum, item) => sum + item.quantity, 0) + w.stockLines.filter((item) => item.productId === product.id && batchById.get(item.batchId)?.status !== 'received').reduce((sum, item) => sum + item.quantity, 0),
      soldUnits: sold.reduce((s, item) => s + item.quantity, 0),
      revenueCents,
      profitCents: revenueCents - costCents,
      marginPct: product.priceCents > 0 ? Math.round(((product.priceCents - product.costCents) / product.priceCents) * 100) : null,
      // Lo que falta pedirle a la fábrica: unidades de pedidos tomados que todavía no entraron en ninguna tanda.
      unbatchedUnits: live.filter((order) => order.status === 'pending' && (!order.batch || order.batch.status === 'received')).flatMap((order) => order.items).filter((item) => item.productId === product.id).reduce((s, item) => s + item.quantity, 0),
    }
  })

  const accounts = w.accounts.map((account) => {
    const own = w.movements.filter((movement) => movement.accountId === account.id)
    const income = own.filter((m) => m.type === 'income').reduce((s, m) => s + m.amountCents, 0)
    const outcome = own.filter((m) => m.type !== 'income').reduce((s, m) => s + m.amountCents, 0)
    return { ...account, incomeCents: income, outcomeCents: outcome, balanceCents: account.openingBalanceCents + income - outcome }
  })

  const batches = w.batches.map((batch) => {
    const included = new Set(w.batchOrders.filter((link) => link.batchId === batch.id).map((link) => link.orderId))
    const own = orders.filter((order) => included.has(order.id))
    const lines = new Map<string, { name: string; size: string | null; quantity: number; costCents: number }>()
    for (const item of own.flatMap((order) => order.items)) {
      const key = `${item.productId}|${item.size ?? ''}`
      const current = lines.get(key) ?? { name: `${item.name}${item.color ? ` · ${item.color}` : ''}`, size: item.size, quantity: 0, costCents: 0 }
      current.quantity += item.quantity
      current.costCents += item.unitCostCents * item.quantity
      lines.set(key, current)
    }
    const extra = w.stockLines.filter((item) => item.batchId === batch.id)
    for (const item of extra) {
      const product = productById.get(item.productId)
      const key = `${item.productId}|${item.size ?? ''}`
      const current = lines.get(key) ?? { name: product ? `${product.name}${product.color ? ` · ${product.color}` : ''}` : 'Producto eliminado', size: item.size, quantity: 0, costCents: 0 }
      current.quantity += item.quantity
      current.costCents += item.unitCostCents * item.quantity
      lines.set(key, current)
    }
    const summary = [...lines.values()].sort((a, b) => a.name.localeCompare(b.name) || (a.size ?? '').localeCompare(b.size ?? ''))
    return { ...batch, stockUnits: extra.reduce((sum, item) => sum + item.quantity, 0), supplierContact: supplierById.get(batch.supplierId)?.contact ?? null, supplierName: supplierById.get(batch.supplierId)?.name ?? 'Proveedor eliminado', orders: own, lines: summary, units: summary.reduce((s, l) => s + l.quantity, 0), costCents: summary.reduce((s, l) => s + l.costCents, 0) }
  })

  const payments = w.payments.map((payment) => {
    const order = orderById.get(payment.orderId)
    return { ...payment, code: order?.code ?? '—', customerName: order?.customerName ?? '—' }
  })

  // Últimos 6 meses, del más viejo al actual.
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 15)
    const key = monthKey(date)
    const sold = live.filter((order) => monthKey(order.createdAt) === key)
    return {
      key,
      label: new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(date).replace('.', ''),
      salesCents: sold.reduce((s, o) => s + o.totalCents, 0),
      costCents: sold.reduce((s, o) => s + o.costCents, 0),
      orders: sold.length,
      collectedCents: w.payments.filter((p) => monthKey(p.paidAt) === key).reduce((s, p) => s + p.amountCents, 0),
      expensesCents: w.expenses.filter((e) => monthKey(e.paidAt) === key).reduce((s, e) => s + e.amountCents, 0),
    }
  })

  const totals = {
    salesCents: live.reduce((s, o) => s + o.totalCents, 0),
    paidCents: live.reduce((s, o) => s + o.paidCents, 0),
    receivableCents: live.reduce((s, o) => s + o.balanceCents, 0),
    owing: live.filter((o) => o.balanceCents > 0).length,
    open: live.filter((o) => o.status !== 'delivered').length,
    unbatched: live.filter((o) => o.status === 'pending' && (!o.batch || o.batch.status === 'received') && o.items.length > 0).length,
    ready: live.filter((o) => o.status === 'ready').length,
    cashCents: accounts.filter((a) => a.active).reduce((s, a) => s + a.balanceCents, 0),
    expensesCents: w.expenses.reduce((s, e) => s + e.amountCents, 0),
  }

  return { availableFor, canFulfill, orders, orderById, customers, customerById, products, productById, suppliers: w.suppliers, supplierById, accounts, accountById, batches, payments, expenses: w.expenses, movements: w.movements, months, month: months[5], previousMonth: months[4], totals }
}

export type View = ReturnType<typeof buildView>
export type OrderView = View['orders'][number]
export type BatchView = View['batches'][number]
export type ProductView = View['products'][number]
export type CustomerView = View['customers'][number]
