'use client'

import { Plus, Ruler, Trash2 } from 'lucide-react'
import { useApp } from '@/components/app/store'
import { Button, Field, Input, MoneyInput, Select } from '@/components/ui/controls'
import { hasChart, toCents } from '@/lib/domain'
import { cn } from '@/lib/utils'

export type Line = { key: number; productId: string; size: string; quantity: string; price: string }

export const emptyLine = (key = 1): Line => ({ key, productId: '', size: '', quantity: '1', price: '' })
const pesos = (cents: number) => String(cents / 100).replace('.', ',')
export const lineFrom = (key: number, item: { productId: string; size: string | null; quantity: number; unitPriceCents?: number }): Line => ({ key, productId: item.productId, size: item.size ?? '', quantity: String(item.quantity), price: item.unitPriceCents === undefined ? '' : pesos(item.unitPriceCents) })

/** Líneas completas, listas para mandar al servidor. */
export const filledLines = (lines: Line[]) => lines.filter((line) => line.productId)
export const linesTotal = (lines: Line[]) => filledLines(lines).reduce((sum, line) => sum + (toCents(line.price) || 0) * (Number(line.quantity) || 0), 0)

/**
 * Cuánto stock libre hay para cada línea, sumando las líneas repetidas del mismo
 * producto y talle. `excludeOrderId` no cuenta la reserva de la propia venta.
 */
export function useLineStock(lines: Line[], excludeOrderId?: string) {
  const { view } = useApp()
  const need = new Map<string, number>()
  for (const line of filledLines(lines)) {
    const key = `${line.productId}|${line.size}`
    need.set(key, (need.get(key) ?? 0) + (Number(line.quantity) || 0))
  }
  const status = (line: Line) => {
    const product = view.productById.get(line.productId)
    if (!product || (product.sizes.length && !line.size)) return null
    const available = Math.max(0, view.availableFor(line.productId, line.size || null, excludeOrderId))
    return { available, enough: available >= (need.get(`${line.productId}|${line.size}`) ?? 0) }
  }
  const lineStatuses = filledLines(lines).map(status)
  const allInStock = lineStatuses.length > 0 && lineStatuses.every((row) => row?.enough)
  return { status, allInStock }
}

export function ProductLines({ lines, onChange, withPrice, showStock, excludeOrderId, allowEmpty, addLabel = 'Agregar otro producto' }: { lines: Line[]; onChange: (lines: Line[]) => void; withPrice?: boolean; showStock?: boolean; excludeOrderId?: string; allowEmpty?: boolean; addLabel?: string }) {
  const { view, open } = useApp()
  const products = view.products.filter((product) => product.active || lines.some((line) => line.productId === product.id))
  const { status } = useLineStock(lines, excludeOrderId)
  const patch = (key: number, change: Partial<Line>) => onChange(lines.map((line) => line.key === key ? { ...line, ...change } : line))
  const incoming = (line: Line) => view.products.find((product) => product.id === line.productId)?.inventory.find((row) => row.size === line.size)?.incoming ?? 0

  return (
    <div className="space-y-3">
      {lines.map((line, index) => {
        const product = view.productById.get(line.productId)
        const stock = showStock ? status(line) : null
        const arriving = showStock ? incoming(line) : 0
        return (
          <div key={line.key} className={cn('grid grid-cols-2 gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:items-end sm:border-0 sm:bg-transparent sm:p-0', withPrice ? 'sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_5rem_minmax(0,1.1fr)_2.5rem]' : 'sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_5rem_2.5rem]')}>
            <Field label="Producto" className={cn('col-span-2 sm:col-span-1', index > 0 && 'sm:[&>span]:sr-only')}>
              <Select value={line.productId} required={index === 0 || allowEmpty} onChange={(event) => { const next = view.productById.get(event.target.value); patch(line.key, { productId: event.target.value, size: next?.sizes.length === 1 ? next.sizes[0] : '', price: next ? pesos(next.priceCents) : '' }) }}>
                <option value="">Elegí…</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}{item.color ? ` · ${item.color}` : ''}</option>)}
              </Select>
            </Field>
            <Field label="Talle" className={cn(index > 0 && 'sm:[&>span]:sr-only')}>
              <Select required={!!product?.sizes.length} disabled={!product?.sizes.length} value={line.size} onChange={(event) => patch(line.key, { size: event.target.value })}>
                <option value="">{product?.sizes.length ? 'Elegí…' : 'Único'}</option>{product?.sizes.map((size) => <option key={size}>{size}</option>)}
              </Select>
            </Field>
            <Field label="Cant." className={cn(index > 0 && 'sm:[&>span]:sr-only')}><Input type="number" inputMode="numeric" min={1} max={10000} required={!!line.productId} value={line.quantity} onChange={(event) => patch(line.key, { quantity: event.target.value })} className="tabular-nums" /></Field>
            {withPrice && <Field label="Precio c/u" className={cn(index > 0 && 'sm:[&>span]:sr-only')}><MoneyInput value={line.price} onChange={(event) => patch(line.key, { price: event.target.value })} /></Field>}
            <button type="button" aria-label="Quitar producto" disabled={!allowEmpty && lines.length === 1} onClick={() => onChange(lines.filter((item) => item.key !== line.key))} className="flex h-11 items-center justify-center self-end rounded-lg text-slate-400 outline-none transition hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-slate-950 disabled:invisible sm:h-10"><Trash2 className="size-4" /></button>
            {(stock || (product && hasChart(product.sizeChart))) && (
              <div className="col-span-full -mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {stock && <span className={cn('font-semibold', stock.enough ? 'text-emerald-700' : 'text-amber-700')}>{stock.enough ? `En stock · ${stock.available} disponibles` : stock.available ? `Solo hay ${stock.available} disponibles` : 'Sin stock disponible'}{!stock.enough && arriving ? ` · llegan ${arriving} de fábrica` : ''}</span>}
                {product && hasChart(product.sizeChart) && <button type="button" onClick={() => open({ type: 'sizeChart', id: product.id })} className="inline-flex items-center gap-1 font-semibold text-slate-700 underline underline-offset-2 outline-none hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-950"><Ruler className="size-3.5" /> Tabla de medidas</button>}
              </div>
            )}
          </div>
        )
      })}
      <Button variant="secondary" size="sm" onClick={() => onChange([...lines, emptyLine(Math.max(0, ...lines.map((line) => line.key)) + 1)])}><Plus className="size-3.5" /> {addLabel}</Button>
    </div>
  )
}
