'use client'

import { Archive, ArchiveRestore, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CircleDollarSign, Download, Factory, FileSpreadsheet, Landmark, LogOut, MoreHorizontal, Pencil, Plus, Receipt, Trash2, Truck, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { createAuthClient } from 'better-auth/react'
import { deleteExpense, setCashAccountActive } from '@/app/actions/finance'
import { setSupplierActive } from '@/app/actions/production'
import { Bar, BatchBadge, Card, Chips, DataTable, Page, PageHeader, PaymentBadge, Stat } from '@/components/app/parts'
import { useApp } from '@/components/app/store'
import { ActionMenu, Badge, Button, EmptyState } from '@/components/ui/controls'
import { EXPENSE_CATEGORIES, formatDate, labelOf, money } from '@/lib/domain'
import { WhatsAppLink } from '@/components/app/whatsapp-link'
import { cn } from '@/lib/utils'

const authClient = createAuthClient()

const iconButton = 'flex size-8 items-center justify-center rounded-lg text-slate-400 outline-none hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-950'

export function Batches() {
  const { view, open } = useApp()
  const waiting = view.orders.filter((order) => order.status === 'pending' && (!order.batch || order.batch.status === 'received') && order.items.length > 0)
  const openBatches = view.batches.filter((batch) => batch.status !== 'received')
  const done = view.batches.filter((batch) => batch.status === 'received')
  const card = (batch: typeof view.batches[number]) => (
    <button key={batch.id} onClick={() => open({ type: 'batchDetail', id: batch.id })} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left outline-none transition hover:border-slate-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-slate-950">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-base font-bold text-slate-950">{batch.name}</p><p className="mt-0.5 truncate text-sm text-slate-500">{batch.supplierName}</p></div><BatchBadge status={batch.status} /></div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[[batch.orders.length, 'pedidos'], [batch.units, `${batch.stockUnits} para stock`], [batch.costCents ? money(batch.costCents) : '—', 'costo']].map(([value, label]) => <div key={label} className="rounded-xl bg-slate-50 px-2 py-2.5"><p className="truncate text-sm font-bold tabular-nums text-slate-950">{value}</p><p className="text-[11px] text-slate-500">{label}</p></div>)}
      </div>
      <p className="mt-3 text-xs text-slate-500">{batch.status === 'received' ? `Recibida el ${formatDate(batch.receivedAt)}` : batch.expectedAt ? `Llega el ${formatDate(batch.expectedAt)}` : `Pedida el ${formatDate(batch.requestedAt)}`}</p>
    </button>
  )
  return (
    <Page>
      <PageHeader title="Tandas de fábrica" description="Compras para clientes, para stock o ambas. Vos decidís cuándo encargar." actions={<Button onClick={() => open({ type: 'batch' })}><Plus className="size-4" /> Nueva tanda</Button>} />
      {waiting.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-900"><strong>{waiting.length} pedidos</strong> ({waiting.reduce((sum, order) => sum + order.units, 0)} unidades) están tomados. Podés cubrirlos con stock o elegir cuáles enviar a fábrica.</p>
          <Button variant="secondary" className="shrink-0 border-amber-300" onClick={() => open({ type: 'batch' })}>Elegir pedidos</Button>
        </div>
      )}
      {view.batches.length === 0 ? <Card><EmptyState icon={Truck} title="Todavía no hay tandas" action={<Button onClick={() => open({ type: 'batch' })}><Plus className="size-4" /> Crear la primera tanda</Button>}>Una tanda junta varios pedidos en un solo encargo a la fábrica y te arma el listado por producto y talle.</EmptyState></Card> : <>
        {openBatches.length > 0 && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{openBatches.map(card)}</div>}
        {done.length > 0 && <><h3 className="pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Recibidas</h3><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{done.map(card)}</div></>}
      </>}
    </Page>
  )
}

export function Suppliers() {
  const { view, open, submit, notify } = useApp()
  return (
    <Page>
      <PageHeader title="Proveedores" description="Las fábricas a las que les encargás." actions={<Button onClick={() => open({ type: 'supplier' })}><Plus className="size-4" /> Nuevo proveedor</Button>} />
      <Card>
        <DataTable rows={view.suppliers} onRowClick={(supplier) => open({ type: 'supplier', id: supplier.id })}
          columns={[
            { header: 'Proveedor', cell: (supplier) => <span className="flex items-center gap-2 font-semibold text-slate-900">{supplier.name}{!supplier.active && <Badge>Archivado</Badge>}</span> },
            { header: 'Contacto', cell: (supplier) => <div><span className="text-slate-600">{supplier.contact || '—'}</span><WhatsAppLink phone={supplier.contact} /></div> },
            { header: 'Fabrica', cell: (supplier) => <span className="flex flex-wrap gap-1">{supplier.categories.length ? supplier.categories.map((category) => <Badge key={category}>{category}</Badge>) : <span className="text-slate-400">—</span>}</span> },
            { header: 'Tandas', align: 'right', cell: (supplier) => view.batches.filter((batch) => batch.supplierId === supplier.id).length },
            { header: '', align: 'right', cell: (supplier) => <span onClick={(event) => event.stopPropagation()}><ActionMenu trigger={<button aria-label={`Acciones de ${supplier.name}`} className={iconButton}><MoreHorizontal className="size-4" /></button>} actions={[{ label: 'Editar', icon: Pencil, onSelect: () => open({ type: 'supplier', id: supplier.id }) }, { label: supplier.active ? 'Archivar' : 'Reactivar', icon: supplier.active ? Archive : ArchiveRestore, onSelect: async () => { const error = await submit(setSupplierActive(supplier.id, !supplier.active), supplier.active ? 'Proveedor archivado' : 'Proveedor reactivado'); if (error) notify(error, true) } }]} /></span> },
          ]}
          card={(supplier) => <div><p className="text-sm font-semibold text-slate-900">{supplier.name}</p><p className="mt-0.5 text-xs text-slate-500">{[supplier.contact, supplier.categories.join(', ')].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</p><WhatsAppLink phone={supplier.contact} /></div>}
          empty={<EmptyState icon={Factory} title="Todavía no hay proveedores" action={<Button onClick={() => open({ type: 'supplier' })}><Plus className="size-4" /> Cargar un proveedor</Button>}>Los vas a necesitar para armar tandas de fábrica.</EmptyState>} />
      </Card>
    </Page>
  )
}

export function Payments() {
  const { view, open } = useApp()
  const owing = view.orders.filter((order) => order.balanceCents > 0).sort((a, b) => b.balanceCents - a.balanceCents)
  return (
    <Page>
      <PageHeader title="Pagos" description="Lo que cobraste y lo que te falta cobrar." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Cobrado este mes" value={money(view.month.collectedCents)} detail={`Mes pasado ${money(view.previousMonth.collectedCents)}`} icon={CircleDollarSign} tone="lime" />
        <Stat label="Por cobrar" value={money(view.totals.receivableCents)} detail={`${owing.length} pedidos con saldo`} icon={WalletCards} tone="amber" />
        <div className="col-span-2 lg:col-span-1"><Stat label="Cobrado en total" value={money(view.totals.paidCents)} detail={`De ${money(view.totals.salesCents)} vendidos`} icon={Landmark} /></div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Falta cobrar" subtitle="Ordenado de mayor a menor saldo">
          {owing.length ? (
            <ul className="divide-y divide-slate-100">
              {owing.map((order) => (
                <li key={order.id} className="flex items-center gap-3 px-5 py-3">
                  <button onClick={() => open({ type: 'orderDetail', id: order.id })} className="min-w-0 flex-1 text-left outline-none focus-visible:underline"><p className="truncate text-sm font-semibold text-slate-900">{order.customerName}</p><p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">{order.code}<PaymentBadge status={order.paymentStatus} /></p></button>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-amber-700">{money(order.balanceCents)}</p>
                  <Button size="sm" variant="secondary" onClick={() => open({ type: 'payment', orderId: order.id })}>Cobrar</Button>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={WalletCards} title="No te deben nada">Todos los pedidos están pagados.</EmptyState>}
        </Card>
        <Card title="Pagos recibidos" subtitle={`${view.payments.length} registrados`}>
          <DataTable rows={view.payments.slice(0, 50)} onRowClick={(payment) => open({ type: 'orderDetail', id: payment.orderId })}
            columns={[
              { header: 'Fecha', cell: (payment) => <span className="whitespace-nowrap text-slate-600">{formatDate(payment.paidAt)}</span> },
              { header: 'Pedido', cell: (payment) => <><p className="font-medium text-slate-900">{payment.customerName}</p><p className="text-xs text-slate-500">{payment.code} · {payment.method}</p></> },
              { header: 'Importe', align: 'right', cell: (payment) => <span className="font-semibold text-emerald-700">{money(payment.amountCents)}</span> },
            ]}
            empty={<EmptyState icon={CircleDollarSign} title="Todavía no registraste pagos">Se cargan desde cada pedido, o con la seña al tomarlo.</EmptyState>} />
        </Card>
      </div>
    </Page>
  )
}

export function Cash() {
  const { view, open, submit, notify } = useApp()
  const [tab, setTab] = useState<'movements' | 'expenses'>('movements')
  const hasAccounts = view.accounts.some((account) => account.active)
  return (
    <Page>
      <PageHeader title="Caja" description="Dónde está la plata y en qué se fue." actions={<>
        <Button variant="secondary" onClick={() => open({ type: 'account' })}><Plus className="size-4" /> Cuenta</Button>
        {hasAccounts && <Button variant="secondary" onClick={() => open({ type: 'movement' })}><ArrowLeftRight className="size-4" /> Movimiento</Button>}
        <Button onClick={() => open({ type: 'expense' })}><Receipt className="size-4" /> Registrar gasto</Button>
      </>} />
      {view.accounts.length === 0 ? <Card><EmptyState icon={Landmark} title="Creá tu primera cuenta" action={<Button onClick={() => open({ type: 'account' })}><Plus className="size-4" /> Nueva cuenta</Button>}>Una cuenta es un lugar donde guardás plata: efectivo, banco o Mercado Pago. Al registrar pagos y gastos elegís en cuál entran o de cuál salen.</EmptyState></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-slate-950 p-5 text-white"><p className="text-xs font-medium text-slate-400">Total disponible</p><p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{money(view.totals.cashCents)}</p><p className="mt-1.5 text-xs text-slate-400">En {view.accounts.filter((account) => account.active).length} cuentas activas</p></div>
          {view.accounts.map((account) => (
            <div key={account.id} className={cn('rounded-2xl border border-slate-200 bg-white p-5', !account.active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-semibold text-slate-900">{account.name}{!account.active && ' (archivada)'}</p><ActionMenu trigger={<button aria-label={`Acciones de ${account.name}`} className={cn(iconButton, '-mr-2 -mt-1.5')}><MoreHorizontal className="size-4" /></button>} actions={[{ label: 'Editar', icon: Pencil, onSelect: () => open({ type: 'account', id: account.id }) }, { label: 'Movimiento', icon: ArrowLeftRight, hidden: !account.active, onSelect: () => open({ type: 'movement', accountId: account.id }) }, { label: account.active ? 'Archivar' : 'Reactivar', icon: account.active ? Archive : ArchiveRestore, onSelect: async () => { const error = await submit(setCashAccountActive(account.id, !account.active), account.active ? 'Cuenta archivada' : 'Cuenta reactivada'); if (error) notify(error, true) } }]} /></div>
              <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-950">{money(account.balanceCents)}</p>
              <p className="mt-1.5 text-xs text-slate-500">Entró {money(account.incomeCents)} · salió {money(account.outcomeCents)}</p>
            </div>
          ))}
        </div>
      )}
      <Chips options={[{ value: 'movements', label: 'Movimientos', count: view.movements.length }, { value: 'expenses', label: 'Gastos', count: view.expenses.length }]} value={tab} onChange={setTab} />
      <Card>
        {tab === 'movements' ? (
          <DataTable rows={view.movements.slice(0, 100)}
            columns={[
              { header: 'Fecha', cell: (movement) => <span className="whitespace-nowrap text-slate-600">{formatDate(movement.occurredAt)}</span> },
              { header: 'Detalle', cell: (movement) => <span className="flex items-center gap-2.5"><span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', movement.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>{movement.type === 'income' ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}</span><span className="font-medium text-slate-900">{movement.description}</span></span> },
              { header: 'Cuenta', cell: (movement) => <span className="text-slate-600">{view.accountById.get(movement.accountId)?.name ?? '—'}</span> },
              { header: 'Importe', align: 'right', cell: (movement) => <span className={cn('font-semibold', movement.type === 'income' ? 'text-emerald-700' : 'text-red-700')}>{movement.type === 'income' ? '+' : '−'}{money(movement.amountCents)}</span> },
            ]}
            card={(movement) => <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{movement.description}</p><p className="mt-0.5 text-xs text-slate-500">{formatDate(movement.occurredAt)} · {view.accountById.get(movement.accountId)?.name ?? '—'}</p></div><p className={cn('shrink-0 text-sm font-bold tabular-nums', movement.type === 'income' ? 'text-emerald-700' : 'text-red-700')}>{movement.type === 'income' ? '+' : '−'}{money(movement.amountCents)}</p></div>}
            empty={<EmptyState icon={ArrowLeftRight} title="Sin movimientos">Aparecen cuando un pago o un gasto se registra en una cuenta.</EmptyState>} />
        ) : (
          <DataTable rows={view.expenses.slice(0, 100)}
            columns={[
              { header: 'Fecha', cell: (expense) => <span className="whitespace-nowrap text-slate-600">{formatDate(expense.paidAt)}</span> },
              { header: 'Gasto', cell: (expense) => <><p className="font-medium text-slate-900">{expense.description}</p><p className="text-xs text-slate-500">{[labelOf(EXPENSE_CATEGORIES, expense.category), expense.supplierId && view.supplierById.get(expense.supplierId)?.name].filter(Boolean).join(' · ')}</p></> },
              { header: 'Importe', align: 'right', cell: (expense) => <span className="font-semibold text-slate-900">{money(expense.amountCents)}</span> },
              { header: '', align: 'right', cell: (expense) => <button aria-label={`Borrar gasto ${expense.description}`} onClick={() => open({ type: 'confirm', title: '¿Borrar este gasto?', confirmLabel: 'Borrar gasto', danger: true, body: <>Se borra <strong>{expense.description}</strong> por {money(expense.amountCents)}. Si había salido de una cuenta, la plata vuelve a esa cuenta.</>, run: async () => { const error = await submit(deleteExpense(expense.id), 'Gasto borrado'); if (error) notify(error, true); return !error } })} className={cn(iconButton, 'ml-auto hover:bg-red-50 hover:text-red-600')}><Trash2 className="size-4" /></button> },
            ]}
            empty={<EmptyState icon={Receipt} title="Sin gastos cargados" action={<Button onClick={() => open({ type: 'expense' })}><Plus className="size-4" /> Registrar un gasto</Button>} />} />
        )}
      </Card>
    </Page>
  )
}

export function Reports() {
  const { view } = useApp()
  const { months, totals } = view
  const maxSales = Math.max(1, ...months.map((month) => month.salesCents))
  const products = view.products.filter((product) => product.soldUnits > 0).sort((a, b) => b.profitCents - a.profitCents)
  const maxProfit = Math.max(1, ...products.map((product) => product.profitCents))
  const customers = view.customers.filter((customer) => customer.totalCents > 0).sort((a, b) => b.totalCents - a.totalCents).slice(0, 8)
  const cost = view.orders.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + order.costCents, 0)
  const gross = totals.salesCents - cost
  return (
    <Page>
      <PageHeader title="Reportes" description="Cómo viene el negocio: ventas, márgenes y quién compra más." />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Vendido" value={money(totals.salesCents)} detail="Pedidos no cancelados" icon={CircleDollarSign} tone="indigo" />
        <Stat label="Costo de mercadería" value={money(cost)} detail={totals.salesCents ? `${Math.round((cost / totals.salesCents) * 100)}% de las ventas` : undefined} icon={Factory} />
        <Stat label="Ganancia bruta" value={money(gross)} detail={totals.salesCents ? `${Math.round((gross / totals.salesCents) * 100)}% de margen` : undefined} icon={Landmark} tone="emerald" />
        <Stat label="Gastos cargados" value={money(totals.expensesCents)} detail={`Resultado ${money(totals.paidCents - totals.expensesCents)} sobre lo cobrado`} icon={Receipt} tone="amber" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Mes a mes" subtitle="Ventas, cobros y gastos de los últimos 6 meses">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-5 py-2.5 text-left">Mes</th><th className="px-4 py-2.5 text-right">Pedidos</th><th className="w-1/3 px-4 py-2.5 text-left">Ventas</th><th className="px-4 py-2.5 text-right">Cobrado</th><th className="px-5 py-2.5 text-right">Gastos</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[...months].reverse().map((month) => <tr key={month.key}><td className="px-5 py-3 font-semibold capitalize text-slate-900">{month.label} {month.key.slice(2, 4)}</td><td className="px-4 py-3 text-right tabular-nums text-slate-600">{month.orders}</td><td className="px-4 py-3"><p className="mb-1 font-semibold tabular-nums text-slate-900">{money(month.salesCents)}</p><Bar value={month.salesCents} max={maxSales} /></td><td className="px-4 py-3 text-right tabular-nums text-emerald-700">{money(month.collectedCents)}</td><td className="px-5 py-3 text-right tabular-nums text-slate-600">{money(month.expensesCents)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Qué deja más ganancia" subtitle="Por producto, según lo vendido">
          {products.length ? (
            <ul className="divide-y divide-slate-100">
              {products.slice(0, 8).map((product) => <li key={product.id} className="px-5 py-3"><div className="flex items-baseline justify-between gap-3"><p className="truncate text-sm font-semibold text-slate-900">{product.name}</p><p className="shrink-0 text-sm font-bold tabular-nums text-slate-950">{money(product.profitCents)}</p></div><p className="mb-1.5 mt-0.5 text-xs text-slate-500">{product.soldUnits} vendidas · {money(product.revenueCents)} en ventas · margen {product.revenueCents ? Math.round((product.profitCents / product.revenueCents) * 100) : 0}%</p><Bar value={Math.max(0, product.profitCents)} max={maxProfit} className="bg-emerald-500" /></li>)}
            </ul>
          ) : <EmptyState icon={FileSpreadsheet} title="Todavía no hay ventas con productos">Aparece cuando cargás pedidos con productos del catálogo.</EmptyState>}
        </Card>
        <Card title="Quién compra más" subtitle="Clientes por monto comprado" className="xl:col-span-2">
          <DataTable rows={customers}
            columns={[
              { header: 'Cliente', cell: (customer) => <span className="font-semibold text-slate-900">{customer.name}</span> },
              { header: 'Pedidos', align: 'right', cell: (customer) => customer.orderCount },
              { header: 'Comprado', align: 'right', cell: (customer) => <span className="font-semibold text-slate-900">{money(customer.totalCents)}</span> },
              { header: 'Debe', align: 'right', cell: (customer) => customer.balanceCents > 0 ? <span className="text-amber-700">{money(customer.balanceCents)}</span> : <span className="text-slate-400">—</span> },
            ]}
            empty={<EmptyState icon={FileSpreadsheet} title="Sin datos todavía" />} />
        </Card>
      </div>
    </Page>
  )
}

export const EXPORTS = [['pedidos', 'Pedidos'], ['clientes', 'Clientes'], ['productos', 'Catálogo'], ['pagos', 'Pagos'], ['gastos', 'Gastos'], ['caja', 'Movimientos de caja'], ['tandas', 'Tandas']] as const
export const FORMATS = [['xlsx', 'Excel'], ['csv', 'CSV'], ['pdf', 'PDF'], ['json', 'JSON']] as const
export const download = (kind: string, format: string) => { window.location.href = `/api/export/orders?tipo=${kind}&format=${format}` }

export function Account() {
  const { user } = useApp()
  const [leaving, setLeaving] = useState(false)
  return (
    <Page>
      <PageHeader title="Mi cuenta" description="Tus datos de acceso y la descarga de toda tu información." />
      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card title="Sesión">
          <div className="p-5">
            <div className="flex items-center gap-3"><div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-lime-200 text-base font-bold text-lime-900">{user.name.slice(0, 2).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-950">{user.name}</p><p className="truncate text-sm text-slate-500">{user.email}</p></div></div>
            <Button variant="secondary" className="mt-5 w-full" disabled={leaving} onClick={async () => { setLeaving(true); await authClient.signOut(); window.location.href = '/sign-in' }}><LogOut className="size-4" /> {leaving ? 'Saliendo…' : 'Cerrar sesión'}</Button>
          </div>
        </Card>
        <Card title="Descargar mis datos" subtitle="Elegí qué querés bajar y en qué formato">
          <ul className="divide-y divide-slate-100">
            {EXPORTS.map(([kind, label]) => <li key={kind} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-2.5 text-sm font-semibold text-slate-900"><Download className="size-4 text-slate-400" />{label}</span><span className="flex gap-1.5">{FORMATS.map(([format, name]) => <Button key={format} size="sm" variant="secondary" onClick={() => download(kind, format)}>{name}</Button>)}</span></li>)}
          </ul>
        </Card>
      </div>
    </Page>
  )
}
