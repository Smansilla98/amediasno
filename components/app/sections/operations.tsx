'use client'

import { Archive, ArchiveRestore, Boxes, CircleDollarSign, Clock, FileSpreadsheet, MoreHorizontal, PackageCheck, Pencil, Plus, Ruler, ShoppingBag, Shirt, Trash2, TrendingUp, Truck, Users, WalletCards } from 'lucide-react'
import { useMemo, useState } from 'react'
import { deleteCustomer } from '@/app/actions/customers'
import { deleteProduct, setProductActive } from '@/app/actions/products'
import { Card, Chips, DataTable, OrderBadge, Page, PageHeader, PaymentBadge, SearchBox, Stat, type Column } from '@/components/app/parts'
import { useApp } from '@/components/app/store'
import { ActionMenu, Badge, Button, EmptyState } from '@/components/ui/controls'
import { ORDER_STATUS, formatDate, formatDayMonth, hasChart, money } from '@/lib/domain'
import type { CustomerView, OrderView, ProductView } from '@/lib/view'
import { WhatsAppLink } from '@/components/app/whatsapp-link'
import { cn } from '@/lib/utils'

const matches = (query: string, ...fields: (string | null | undefined)[]) => {
  const needle = query.trim().toLowerCase()
  return !needle || fields.some((field) => field?.toLowerCase().includes(needle))
}

const orderColumns: Column<OrderView>[] = [
  { header: 'Venta', cell: (order) => <><p className="whitespace-nowrap font-semibold text-slate-900">{order.code}</p><p className="text-xs text-slate-500">{formatDayMonth(order.createdAt)}</p></> },
  { header: 'Cliente', cell: (order) => <><p className="whitespace-nowrap font-medium text-slate-900">{order.customerName}</p>{order.recipient && order.recipient !== order.customerName && <p className="text-xs text-slate-500">Para {order.recipient}</p>}</> },
  { header: 'Productos', className: 'max-w-[280px]', cell: (order) => <p className="truncate text-slate-600" title={order.summary}>{order.summary}</p> },
  { header: 'Estado', cell: (order) => <OrderBadge status={order.status} /> },
  { header: 'Pago', cell: (order) => order.status === 'cancelled' ? <span className="text-slate-400">—</span> : <PaymentBadge status={order.paymentStatus} balanceCents={order.balanceCents} /> },
  { header: 'Total', align: 'right', cell: (order) => <span className="font-semibold text-slate-900">{money(order.totalCents)}</span> },
]

const OrderCard = ({ order }: { order: OrderView }) => (
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-slate-900">{order.customerName}</p>
      <p className="mt-0.5 truncate text-xs text-slate-500">{order.code} · {order.summary}</p>
      <div className="mt-2 flex flex-wrap gap-1.5"><OrderBadge status={order.status} />{order.status !== 'cancelled' && <PaymentBadge status={order.paymentStatus} balanceCents={order.balanceCents} />}</div>
    </div>
    <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{money(order.totalCents)}</p>
  </div>
)

export function Overview() {
  const { view, open, go, user } = useApp()
  const { totals, month, months } = view
  const max = Math.max(1, ...months.flatMap((item) => [item.collectedCents, item.expensesCents]))
  const profit = month.salesCents - month.costCents
  const tasks = [
    { count: totals.deliverable, label: 'ventas pendientes que ya podés entregar con stock', icon: Boxes, tone: 'bg-emerald-100 text-emerald-700', onClick: () => go('pedidos') },
    { count: totals.unbatched, label: 'ventas sin stock: encargalas a fábrica', icon: Truck, tone: 'bg-amber-100 text-amber-700', onClick: () => go('tandas') },
    { count: totals.ready, label: 'ventas reservadas listas para entregar', icon: PackageCheck, tone: 'bg-violet-100 text-violet-700', onClick: () => go('pedidos') },
    { count: totals.owing, label: 'ventas con saldo por cobrar', icon: WalletCards, tone: 'bg-red-100 text-red-700', onClick: () => go('pagos') },
  ].filter((task) => task.count > 0)

  if (!view.orders.length && !view.products.length && !view.customers.length) {
    return (
      <Page>
        <PageHeader title={`Hola, ${user.name.split(' ')[0]}`} description="Empezá cargando lo que vendés y cuánto tenés. Después cargá tu primera venta." />
        <div className="grid gap-4 sm:grid-cols-3">
          {[{ step: '1', title: 'Cargá tus productos', body: 'Con costo, precio, talles y el stock de cada talle. Si ya los tenés en Excel o Google Sheets, importalos de una vez.', action: 'Nuevo producto', run: () => open({ type: 'product' }), extra: { label: 'Importar planilla', run: () => open({ type: 'import', kind: 'products' }) } }, { step: '2', title: 'Vendé', body: 'Si hay stock, la entregás en el momento. Si no, queda pendiente.', action: 'Nueva venta', run: () => open({ type: 'order' }) }, { step: '3', title: 'Pedí a fábrica', body: 'Para reponer stock, para ventas pendientes o ambas cosas.', action: 'Pedido a fábrica', run: () => open({ type: 'batch' }) }].map((item) => (
            <div key={item.step} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
              <span className="flex size-8 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white">{item.step}</span>
              <p className="mt-4 text-base font-bold text-slate-950">{item.title}</p>
              <p className="mt-1 flex-1 text-sm text-slate-500">{item.body}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="secondary" className="w-fit" onClick={item.run}>{item.action}</Button>
                {'extra' in item && item.extra && <Button variant="secondary" className="w-fit" onClick={item.extra.run}><FileSpreadsheet className="size-4" /> {item.extra.label}</Button>}
              </div>
            </div>
          ))}
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Ventas en curso" value={totals.open} detail={`${month.orders} cargadas este mes`} icon={ShoppingBag} tone="indigo" onClick={() => go('pedidos')} />
        <Stat label="Cobrado este mes" value={money(month.collectedCents)} detail={`Ventas del mes ${money(month.salesCents)}`} icon={CircleDollarSign} tone="lime" onClick={() => go('pagos')} />
        <Stat label="Por cobrar" value={money(totals.receivableCents)} detail={totals.owing ? `${totals.owing} ventas con saldo` : 'Nada pendiente'} icon={WalletCards} tone="amber" onClick={() => go('pagos')} />
        <Stat label="Ganancia del mes" value={month.costCents > 0 ? money(profit) : '—'} detail={month.costCents > 0 && month.salesCents > 0 ? `${Math.round((profit / month.salesCents) * 100)}% de margen sobre ventas` : 'Cargá costos en el catálogo'} icon={TrendingUp} tone="emerald" onClick={() => go('reportes')} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Últimas ventas" subtitle="Tocá una venta para ver el detalle" action={<Button size="sm" onClick={() => open({ type: 'order' })}><Plus className="size-3.5" /> Nueva venta</Button>}>
          <DataTable rows={view.orders.slice(0, 8)} columns={orderColumns} onRowClick={(order) => open({ type: 'orderDetail', id: order.id })} card={(order) => <OrderCard order={order} />}
            empty={<EmptyState icon={ShoppingBag} title="Todavía no hay ventas" action={<Button onClick={() => open({ type: 'order' })}><Plus className="size-4" /> Cargar la primera venta</Button>} />} />
          {view.orders.length > 8 && <div className="border-t border-slate-100 px-5 py-3"><button onClick={() => go('pedidos')} className="text-sm font-semibold text-slate-950 underline underline-offset-4">Ver las {view.orders.length} ventas</button></div>}
        </Card>

        <div className="space-y-6">
          {tasks.length > 0 && (
            <Card title="Para hacer">
              <ul className="divide-y divide-slate-100">
                {tasks.map((task) => <li key={task.label}><button onClick={task.onClick} className="flex w-full items-center gap-3 px-5 py-3.5 text-left outline-none transition hover:bg-slate-50 focus-visible:bg-slate-50"><span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', task.tone)}><task.icon className="size-[17px]" /></span><span className="text-sm text-slate-700"><strong className="text-slate-950">{task.count}</strong> {task.label}</span></button></li>)}
              </ul>
            </Card>
          )}
          <Card title="Entró y salió" subtitle="Cobros y gastos, últimos 6 meses">
            <div className="px-5 pb-5 pt-4">
              <div className="flex h-36 items-end gap-2.5">
                {months.map((item) => (
                  <div key={item.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${item.label}: cobrado ${money(item.collectedCents)} · gastado ${money(item.expensesCents)}`}>
                    <div className="flex h-full w-full items-end justify-center gap-1">
                      <div className="w-1/2 max-w-4 rounded-t bg-slate-900" style={{ height: `${Math.max(item.collectedCents ? 3 : 0, (item.collectedCents / max) * 100)}%` }} />
                      <div className="w-1/2 max-w-4 rounded-t bg-amber-400" style={{ height: `${Math.max(item.expensesCents ? 3 : 0, (item.expensesCents / max) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] capitalize text-slate-500">{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-4 border-t border-slate-100 pt-3 text-xs text-slate-600"><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-slate-900" />Cobros</span><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-amber-400" />Gastos</span><span className="ml-auto font-semibold text-slate-900">En caja {money(totals.cashCents)}</span></div>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  )
}

const ORDER_FILTERS = ['all', 'deliverable', 'pending', 'in_production', 'ready', 'delivered', 'owing', 'cancelled'] as const
type OrderFilter = typeof ORDER_FILTERS[number]

export function Orders() {
  const { view, open } = useApp()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<OrderFilter>('all')
  const byFilter = (order: OrderView, value: OrderFilter) => value === 'all' ? order.status !== 'cancelled' : value === 'owing' ? order.balanceCents > 0 : value === 'deliverable' ? (order.status === 'pending' || order.status === 'in_production') && view.canFulfill(order) : order.status === value
  const rows = useMemo(() => view.orders.filter((order) => byFilter(order, filter) && matches(query, order.code, order.customerName, order.recipient, order.summary, order.block, order.professor, order.venue)), [view, query, filter])
  const options = ORDER_FILTERS.map((value) => ({ value, label: value === 'all' ? 'Todas' : value === 'owing' ? 'Con saldo' : value === 'deliverable' ? 'Se pueden entregar' : ORDER_STATUS[value], count: view.orders.filter((order) => byFilter(order, value)).length })).filter((option) => option.value === 'all' || option.count > 0)
  return (
    <Page>
      <PageHeader title="Ventas" description="Cada venta, desde que se carga hasta que se entrega y se cobra." actions={<Button onClick={() => open({ type: 'order' })}><Plus className="size-4" /> Nueva venta</Button>} />
      <div className="space-y-3"><SearchBox value={query} onChange={setQuery} placeholder="Buscar por cliente, código, producto, bloque…" /><Chips options={options} value={filter} onChange={setFilter} /></div>
      <Card>
        <DataTable rows={rows} columns={[...orderColumns, { header: 'Entrega', cell: (order) => <span className="whitespace-nowrap text-slate-600">{formatDate(order.deliveryDate)}</span> }]} onRowClick={(order) => open({ type: 'orderDetail', id: order.id })} card={(order) => <OrderCard order={order} />}
          empty={view.orders.length ? <EmptyState icon={ShoppingBag} title="Ninguna venta coincide">Probá con otra búsqueda o cambiá el filtro.</EmptyState> : <EmptyState icon={ShoppingBag} title="Todavía no hay ventas" action={<Button onClick={() => open({ type: 'order' })}><Plus className="size-4" /> Cargar la primera venta</Button>}>Cuando cargues uno vas a poder seguirlo desde acá.</EmptyState>} />
      </Card>
    </Page>
  )
}

export function Customers() {
  const { view, open, submit, notify } = useApp()
  const [query, setQuery] = useState('')
  const rows = view.customers.filter((customer) => matches(query, customer.name, customer.phone, customer.email))
  const menu = (customer: CustomerView) => (
    <span onClick={(event) => event.stopPropagation()}>
      <ActionMenu trigger={<button aria-label={`Acciones de ${customer.name}`} className="flex size-8 items-center justify-center rounded-lg text-slate-400 outline-none hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-950"><MoreHorizontal className="size-4" /></button>} actions={[
        { label: 'Editar', icon: Pencil, onSelect: () => open({ type: 'customer', id: customer.id }) },
        { label: 'Borrar', icon: Trash2, danger: true, hidden: customer.orderCount > 0, onSelect: () => open({ type: 'confirm', title: `¿Borrar a ${customer.name}?`, confirmLabel: 'Borrar cliente', danger: true, body: 'No tiene compras cargadas. Esta acción no se puede deshacer.', run: async () => { const error = await submit(deleteCustomer(customer.id), 'Cliente borrado'); if (error) notify(error, true); return !error } }) },
      ]} />
    </span>
  )
  return (
    <Page>
      <PageHeader title="Clientes" description="Quién te compra, cuánto y qué te debe." actions={<><Button variant="secondary" onClick={() => open({ type: 'import', kind: 'customers' })}><FileSpreadsheet className="size-4" /> Importar</Button><Button onClick={() => open({ type: 'customer' })}><Plus className="size-4" /> Nuevo cliente</Button></>} />
      <SearchBox value={query} onChange={setQuery} placeholder="Buscar por nombre, teléfono o email…" />
      <Card>
        <DataTable rows={rows} onRowClick={(customer) => open({ type: 'customer', id: customer.id })}
          columns={[
            { header: 'Cliente', cell: (customer) => <p className="font-semibold text-slate-900">{customer.name}</p> },
            { header: 'Contacto', cell: (customer) => <div><span className="text-slate-600">{customer.phone || customer.email || '—'}</span><WhatsAppLink phone={customer.phone} /></div> },
            { header: 'Compras', align: 'right', cell: (customer) => customer.orderCount },
            { header: 'Comprado', align: 'right', cell: (customer) => money(customer.totalCents) },
            { header: 'Debe', align: 'right', cell: (customer) => customer.balanceCents > 0 ? <span className="font-semibold text-amber-700">{money(customer.balanceCents)}</span> : <span className="text-slate-400">—</span> },
            { header: '', align: 'right', cell: menu },
          ]}
          card={(customer) => <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{customer.name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{customer.phone || customer.email || 'Sin contacto'} · {customer.orderCount} compras</p><WhatsAppLink phone={customer.phone} /></div>{customer.balanceCents > 0 ? <Badge tone="amber">Debe {money(customer.balanceCents)}</Badge> : <span className="text-sm font-semibold tabular-nums text-slate-700">{money(customer.totalCents)}</span>}</div>}
          empty={view.customers.length ? <EmptyState icon={Users} title="Ningún cliente coincide" /> : <EmptyState icon={Users} title="Todavía no hay clientes" action={<Button onClick={() => open({ type: 'customer' })}><Plus className="size-4" /> Cargar un cliente</Button>}>También podés cargarlos al hacer una venta.</EmptyState>} />
      </Card>
    </Page>
  )
}

export function Catalog() {
  const { view, open, submit, notify, go } = useApp()
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const archived = view.products.filter((product) => !product.active).length
  const rows = view.products.filter((product) => (showArchived ? !product.active : product.active) && matches(query, product.name, product.category, product.color))
  const active = view.products.filter((product) => product.active)
  const toggle = async (product: ProductView) => { const error = await submit(setProductActive(product.id, !product.active), product.active ? 'Producto archivado' : 'Producto reactivado'); if (error) notify(error, true) }
  const menu = (product: ProductView) => (
    <span onClick={(event) => event.stopPropagation()}>
      <ActionMenu trigger={<button aria-label={`Acciones de ${product.name}`} className="flex size-8 items-center justify-center rounded-lg text-slate-400 outline-none hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-950"><MoreHorizontal className="size-4" /></button>} actions={[
        { label: 'Editar', icon: Pencil, onSelect: () => open({ type: 'product', id: product.id }) },
        { label: 'Tabla de medidas', icon: Ruler, hidden: !hasChart(product.sizeChart), onSelect: () => open({ type: 'sizeChart', id: product.id }) },
        { label: 'Ingreso de stock', icon: Boxes, hidden: !product.active, onSelect: () => open({ type: 'stock', id: product.id, mode: 'add' }) },
        { label: product.active ? 'Archivar (dejar de vender)' : 'Reactivar', icon: product.active ? Archive : ArchiveRestore, onSelect: () => toggle(product) },
        { label: 'Borrar', icon: Trash2, danger: true, hidden: product.soldUnits > 0, onSelect: () => open({ type: 'confirm', title: `¿Borrar ${product.name}?`, confirmLabel: 'Borrar producto', danger: true, body: 'Se borra con su stock e historial. Solo se puede si nunca se usó en ventas ni pedidos a fábrica; si no, archivalo.', run: async () => { const error = await submit(deleteProduct(product.id), 'Producto borrado'); if (error) notify(error, true); return !error } }) },
      ]} />
    </span>
  )
  return (
    <Page>
      <PageHeader title="Productos" description="Lo que vendés: nombre, talles, costo y precio. El stock de cada talle se maneja en Stock." actions={<><Button variant="secondary" onClick={() => open({ type: 'import', kind: 'products' })}><FileSpreadsheet className="size-4" /> Importar planilla</Button><Button onClick={() => open({ type: 'product' })}><Plus className="size-4" /> Nuevo producto</Button></>} />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Productos" value={active.length} icon={Shirt} />
        <Stat label="Disponibles" value={`${active.reduce((sum, product) => sum + product.availableStock, 0)} u.`} icon={Boxes} tone="emerald" onClick={() => go('stock')} />
        <Stat label="Llegan de fábrica" value={`${active.reduce((sum, product) => sum + product.requestedStock, 0)} u.`} icon={Clock} tone="amber" onClick={() => go('tandas')} />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><SearchBox value={query} onChange={setQuery} placeholder="Buscar producto, categoría o color…" />{archived > 0 && <Chips options={[{ value: 'active', label: 'Activos' }, { value: 'archived', label: 'Archivados', count: archived }]} value={showArchived ? 'archived' : 'active'} onChange={(value) => setShowArchived(value === 'archived')} />}</div>
      <Card>
        <DataTable rows={rows} onRowClick={(product) => open({ type: 'product', id: product.id })}
          columns={[
            { header: 'Producto', cell: (product) => <><p className="flex items-center gap-2 font-semibold text-slate-900">{product.name}{hasChart(product.sizeChart) && <Ruler aria-label="Tiene tabla de medidas" className="size-3.5 text-slate-400" />}</p><p className="text-xs text-slate-500">{[product.category, product.color, product.sizes.join(' / ')].filter(Boolean).join(' · ')}</p></> },
            { header: 'Costo', align: 'right', cell: (product) => <span className="text-slate-600">{money(product.costCents)}</span> },
            { header: 'Precio', align: 'right', cell: (product) => <span className="font-semibold text-slate-900">{money(product.priceCents)}</span> },
            { header: 'Margen', align: 'right', cell: (product) => product.marginPct === null ? '—' : <Badge tone={product.marginPct >= 40 ? 'green' : product.marginPct >= 20 ? 'amber' : 'red'}>{product.marginPct}%</Badge> },
            { header: 'Disponible', align: 'right', cell: (product) => <div><strong className={product.availableStock ? 'text-emerald-700' : 'text-slate-400'}>{product.availableStock} u.</strong><p className="text-xs text-slate-500">{product.inventory.filter((row) => row.available > 0).map((row) => `${row.size || 'Único'}: ${row.available}`).join(' · ') || 'Sin stock'}</p></div> },
            { header: 'En camino', align: 'right', cell: (product) => product.requestedStock > 0 ? <span className="text-amber-700">{product.requestedStock} u.</span> : <span className="text-slate-400">—</span> },
            { header: '', align: 'right', cell: menu },
          ]}
          card={(product) => <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{product.name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{[product.category, product.color, product.sizes.join(' / ')].filter(Boolean).join(' · ')}</p><p className="mt-1.5 text-xs text-slate-600">Disponibles <strong>{product.availableStock}</strong>{product.reservedStock > 0 && <> · reservadas {product.reservedStock}</>}{product.requestedStock > 0 && <> · en camino <strong className="text-amber-700">{product.requestedStock}</strong></>}</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold tabular-nums text-slate-900">{money(product.priceCents)}</p>{product.marginPct !== null && <p className="text-xs text-slate-500">{product.marginPct}% margen</p>}</div></div>}
          empty={view.products.length ? <EmptyState icon={Shirt} title="Ningún producto coincide" /> : <EmptyState icon={Shirt} title="Todavía no hay productos" action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={() => open({ type: 'import', kind: 'products' })}><FileSpreadsheet className="size-4" /> Importar desde Excel</Button><Button variant="secondary" onClick={() => open({ type: 'product' })}><Plus className="size-4" /> Cargar uno</Button></div>}>Cargá lo que vendés con su costo, precio, talles y stock. Si ya lo tenés en una planilla, importala de una vez.</EmptyState>} />
      </Card>
    </Page>
  )
}
