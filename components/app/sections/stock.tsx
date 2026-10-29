'use client'

import { Boxes, ClipboardList, FileSpreadsheet, PackageOpen, Plus, Shirt, Truck } from 'lucide-react'
import { useState } from 'react'
import { Card, Chips, Page, PageHeader, SearchBox, Stat } from '@/components/app/parts'
import { useApp } from '@/components/app/store'
import { Button, EmptyState } from '@/components/ui/controls'
import { formatDayMonth } from '@/lib/domain'
import type { ProductView } from '@/lib/view'
import { cn } from '@/lib/utils'

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'in', label: 'Con stock' },
  { value: 'out', label: 'Sin stock' },
  { value: 'short', label: 'Faltan para ventas' },
] as const
type Filter = typeof FILTERS[number]['value']

const MOVEMENT: Record<string, string> = { adjustment: 'Carga manual', received: 'Llegó de fábrica', delivered: 'Entrega', returned: 'Entrega deshecha', classification: 'Pasó a talle' }

const short = (product: ProductView) => product.inventory.some((row) => row.waiting > Math.max(0, row.available) + row.incoming)

export function Stock() {
  const { view, open, go } = useApp()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const active = view.products.filter((product) => product.active)
  const byFilter = (product: ProductView, value: Filter) => value === 'in' ? product.stock > 0 : value === 'out' ? product.availableStock === 0 : value === 'short' ? short(product) : true
  const needle = query.trim().toLowerCase()
  const rows = active.filter((product) => byFilter(product, filter) && (!needle || [product.name, product.category, product.color].some((field) => field?.toLowerCase().includes(needle))))
  const sum = (pick: (product: ProductView) => number) => active.reduce((total, product) => total + pick(product), 0)

  if (!active.length) {
    return (
      <Page>
        <PageHeader title="Stock" description="Lo que tenés en mano, talle por talle." />
        <Card><EmptyState icon={Boxes} title="Todavía no hay productos" action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={() => open({ type: 'import', kind: 'products' })}><FileSpreadsheet className="size-4" /> Importar desde Excel</Button><Button variant="secondary" onClick={() => open({ type: 'product' })}><Plus className="size-4" /> Cargar uno</Button></div>}>Al cargar un producto podés indicar cuántas unidades tenés de cada talle, o importar todo desde una planilla.</EmptyState></Card>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader title="Stock" description="Lo que tenés en mano, talle por talle. Disponible = lo que hay menos lo reservado para ventas." actions={<><Button variant="secondary" onClick={() => open({ type: 'import', kind: 'products' })}><FileSpreadsheet className="size-4" /> Importar conteo</Button><Button variant="secondary" onClick={() => open({ type: 'batch' })}><Truck className="size-4" /> Pedir a fábrica</Button></>} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="En mano" value={`${sum((product) => product.stock)} u.`} icon={Boxes} />
        <Stat label="Disponibles" value={`${sum((product) => product.availableStock)} u.`} detail="Para vender ya" icon={PackageOpen} tone="emerald" />
        <Stat label="Reservadas" value={`${sum((product) => product.reservedStock)} u.`} detail={`${view.totals.ready} ventas listas para entregar`} icon={ClipboardList} tone="indigo" onClick={() => go('pedidos')} />
        <Stat label="Llegan de fábrica" value={`${view.totals.incomingUnits} u.`} detail={`${view.batches.filter((batch) => batch.status !== 'received').length} pedidos abiertos`} icon={Truck} tone="amber" />
      </div>
      <div className="space-y-3"><SearchBox value={query} onChange={setQuery} placeholder="Buscar producto, categoría o color…" /><Chips options={FILTERS.map((option) => ({ ...option, count: active.filter((product) => byFilter(product, option.value)).length }))} value={filter} onChange={setFilter} /></div>

      {rows.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((product) => (
            <section key={product.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => open({ type: 'product', id: product.id })} className="min-w-0 text-left outline-none focus-visible:underline">
                  <p className="truncate text-base font-bold text-slate-950">{product.name}</p>
                  <p className="truncate text-xs text-slate-500">{[product.category, product.color].filter(Boolean).join(' · ')}</p>
                </button>
                <div className="shrink-0 text-right"><p className="text-xl font-bold tabular-nums text-slate-950">{product.availableStock}</p><p className="text-[11px] text-slate-500">disponibles</p></div>
              </div>
              <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {product.inventory.map((row) => {
                  const missing = row.waiting > Math.max(0, row.available) + row.incoming
                  return (
                    <li key={row.size || 'sin-talle'} className={cn('rounded-xl border px-2.5 py-2', row.legacy ? 'border-amber-300 bg-amber-50' : row.available > 0 ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50')}>
                      <div className="flex items-baseline justify-between gap-1"><span className="text-xs font-bold text-slate-700">{row.size || (product.sizes.length ? 'Sin talle' : 'Único')}</span><span className={cn('text-lg font-bold tabular-nums', row.available > 0 ? 'text-emerald-700' : row.available < 0 ? 'text-red-600' : 'text-slate-400')}>{row.available}</span></div>
                      <p className="mt-0.5 text-[11px] leading-tight text-slate-500">{row.stock} en mano{row.reserved > 0 && ` · ${row.reserved} res.`}</p>
                      {row.incoming > 0 && <p className="text-[11px] font-semibold leading-tight text-amber-700">+{row.incoming} en camino</p>}
                      {missing && <p className="text-[11px] font-semibold leading-tight text-red-600">Faltan para ventas</p>}
                      {row.legacy && <p className="text-[11px] font-semibold leading-tight text-amber-800">Asignale talle</p>}
                    </li>
                  )
                })}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <Button size="sm" onClick={() => open({ type: 'stock', id: product.id, mode: 'add' })}><Plus className="size-3.5" /> Ingreso</Button>
                <Button size="sm" variant="secondary" onClick={() => open({ type: 'stock', id: product.id, mode: 'set' })}>Corregir conteo</Button>
              </div>
            </section>
          ))}
        </div>
      ) : <Card><EmptyState icon={Shirt} title="Ningún producto coincide">Probá con otra búsqueda o cambiá el filtro.</EmptyState></Card>}

      <Card title="Últimos movimientos" subtitle="Ingresos, entregas, recepciones y correcciones">
        {view.stockMovements.length ? (
          <ul className="divide-y divide-slate-100">
            {view.stockMovements.slice(0, 30).map((movement) => (
              <li key={movement.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className={cn('w-12 shrink-0 text-right font-bold tabular-nums', movement.signed > 0 ? 'text-emerald-700' : 'text-red-600')}>{movement.signed > 0 ? '+' : ''}{movement.signed}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium text-slate-900">{movement.productName}{movement.size ? ` · ${movement.size}` : ''}</span><span className="block truncate text-xs text-slate-500">{MOVEMENT[movement.type] ?? movement.type}{movement.notes ? ` · ${movement.notes}` : ''}</span></span>
                <span className="shrink-0 text-xs text-slate-500">{formatDayMonth(movement.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 py-4 text-sm text-slate-500">Todavía no hay movimientos.</p>}
      </Card>
    </Page>
  )
}
