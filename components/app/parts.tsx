'use client'

import { Search, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge, type Tone } from '@/components/ui/controls'
import { BATCH_STATUS, ORDER_STATUS, PAYMENT_STATUS, labelOf, money } from '@/lib/domain'
import { cn } from '@/lib/utils'

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1320px] space-y-6 px-4 pb-32 pt-5 sm:px-8 sm:pt-8 lg:pb-12">{children}</div>
}

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">{title}</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, subtitle, action, children, className }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-slate-200 bg-white', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0"><h3 className="text-sm font-bold text-slate-950">{title}</h3>{subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}</div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

const STAT_TONES = { slate: 'bg-slate-100 text-slate-700', indigo: 'bg-indigo-100 text-indigo-700', lime: 'bg-lime-100 text-lime-800', amber: 'bg-amber-100 text-amber-700', emerald: 'bg-emerald-100 text-emerald-700', red: 'bg-red-100 text-red-700' } as const

export function Stat({ label, value, detail, icon: Icon, tone = 'slate', onClick }: { label: string; value: ReactNode; detail?: ReactNode; icon: LucideIcon; tone?: keyof typeof STAT_TONES; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={cn('rounded-2xl border border-slate-200 bg-white p-4 text-left sm:p-5', onClick && 'outline-none transition hover:border-slate-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-slate-950')}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <div className={cn('hidden size-9 shrink-0 items-center justify-center rounded-xl sm:flex', STAT_TONES[tone])}><Icon className="size-[17px]" /></div>
      </div>
      <p className="mt-1 text-xl font-bold tracking-tight text-slate-950 tabular-nums sm:text-2xl">{value}</p>
      {detail && <p className="mt-1.5 text-xs text-slate-500">{detail}</p>}
    </Tag>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10" />
    </div>
  )
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0" role="tablist">
      {options.map((option) => (
        <button key={option.value} role="tab" aria-selected={value === option.value} onClick={() => onChange(option.value)} className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-slate-950', value === option.value ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
          {option.label}{option.count !== undefined && <span className={cn('tabular-nums', value === option.value ? 'text-slate-300' : 'text-slate-400')}>{option.count}</span>}
        </button>
      ))}
    </div>
  )
}

export type Column<T> = { header: string; cell: (row: T) => ReactNode; align?: 'right'; className?: string }

/** Tabla en escritorio; en el celular, tarjetas si se pasa `card`. */
export function DataTable<T extends { id: string }>({ rows, columns, onRowClick, card, empty }: { rows: T[]; columns: Column<T>[]; onRowClick?: (row: T) => void; card?: (row: T) => ReactNode; empty: ReactNode }) {
  if (!rows.length) return <>{empty}</>
  return (
    <>
      {card && <ul className="divide-y divide-slate-100 sm:hidden">{rows.map((row) => <li key={row.id}><button onClick={() => onRowClick?.(row)} className="block w-full px-4 py-3.5 text-left outline-none active:bg-slate-50 focus-visible:bg-slate-50">{card(row)}</button></li>)}</ul>}
      <div className={cn('overflow-x-auto', card && 'hidden sm:block')}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {columns.map((column) => <th key={column.header} scope="col" className={cn('whitespace-nowrap px-4 py-2.5 first:pl-5 last:pr-5', column.align === 'right' && 'text-right')}>{column.header}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} onClick={onRowClick ? () => onRowClick(row) : undefined} tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (event) => { if (event.key === 'Enter' && event.target === event.currentTarget) onRowClick(row) } : undefined} className={cn('outline-none', onRowClick && 'cursor-pointer transition hover:bg-slate-50 focus-visible:bg-slate-50')}>
                {columns.map((column) => <td key={column.header} className={cn('px-4 py-3 align-middle first:pl-5 last:pr-5', column.align === 'right' && 'text-right tabular-nums', column.className)}>{column.cell(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

const ORDER_TONE: Record<string, Tone> = { pending: 'amber', in_production: 'sky', ready: 'violet', delivered: 'green', cancelled: 'neutral' }
const PAYMENT_TONE: Record<string, Tone> = { pending: 'red', partial: 'amber', paid: 'green' }
const BATCH_TONE: Record<string, Tone> = { requested: 'amber', in_production: 'sky', received: 'green' }

export const OrderBadge = ({ status }: { status: string }) => <Badge tone={ORDER_TONE[status]}>{labelOf(ORDER_STATUS, status)}</Badge>
export const BatchBadge = ({ status }: { status: string }) => <Badge tone={BATCH_TONE[status]}>{labelOf(BATCH_STATUS, status)}</Badge>
export function PaymentBadge({ status, balanceCents }: { status: string; balanceCents?: number }) {
  return <Badge tone={PAYMENT_TONE[status]}>{labelOf(PAYMENT_STATUS, status)}{status === 'partial' && balanceCents ? <span className="font-normal opacity-80">· falta {money(balanceCents)}</span> : null}</Badge>
}

/** Barras horizontales simples para comparar importes. */
export function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className={cn('h-full rounded-full bg-slate-900', className)} style={{ width: `${max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0}%` }} /></div>
}
