'use client'

import { Menu } from '@base-ui/react/menu'
import type { LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const BUTTON = {
  primary: 'bg-slate-950 text-white shadow-sm hover:bg-slate-800',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
} as const

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...props }: ComponentProps<'button'> & { variant?: keyof typeof BUTTON; size?: 'sm' | 'md' }) {
  return <button type={type} className={cn('inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50', size === 'sm' ? 'h-8 px-3 text-xs' : 'h-11 px-4 text-sm sm:h-10', BUTTON[variant], className)} {...props} />
}

const CONTROL = 'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10 disabled:bg-slate-100 disabled:text-slate-500 sm:h-10 sm:text-sm'

export function Field({ label, hint, optional, className, children }: { label: string; hint?: ReactNode; optional?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="flex items-baseline gap-2 text-[13px] font-semibold text-slate-700">{label}{optional && <span className="text-[11px] font-normal text-slate-400">opcional</span>}</span>
      {children}
      {hint && <span className="text-xs leading-snug text-slate-500">{hint}</span>}
    </label>
  )
}

export const Input = ({ className, ...props }: ComponentProps<'input'>) => <input className={cn(CONTROL, className)} {...props} />
export const Textarea = ({ className, ...props }: ComponentProps<'textarea'>) => <textarea rows={3} className={cn(CONTROL, 'h-auto min-h-20 py-2.5 sm:h-auto', className)} {...props} />
export const Select = ({ className, ...props }: ComponentProps<'select'>) => <select className={cn(CONTROL, 'appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2020%2020%27%20fill=%27%2364748b%27%3E%3Cpath%20d=%27M5.5%207.5%2010%2012l4.5-4.5%27%20stroke=%27%2364748b%27%20stroke-width=%271.6%27%20fill=%27none%27%20stroke-linecap=%27round%27/%3E%3C/svg%3E")] bg-[length:1.1rem] bg-[right_0.6rem_center] bg-no-repeat pr-9', className)} {...props} />

/** Importe en pesos. Acepta "1500", "1.500" o "1500,50". */
export function MoneyInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">$</span>
      <input inputMode="decimal" autoComplete="off" placeholder="0" className={cn(CONTROL, 'pl-7 tabular-nums', className)} {...props} />
    </div>
  )
}

export function FormSection({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-t border-slate-200 pt-5 first:border-0 first:pt-0', className)}>
      {title && <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{title}</h3>}
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

const TONES = {
  neutral: 'bg-slate-100 text-slate-600',
  amber: 'bg-amber-100 text-amber-800',
  sky: 'bg-sky-100 text-sky-800',
  violet: 'bg-violet-100 text-violet-800',
  green: 'bg-emerald-100 text-emerald-800',
  red: 'bg-red-100 text-red-700',
} as const
export type Tone = keyof typeof TONES

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', TONES[tone], className)}>{children}</span>
}

export type MenuAction = { label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; hidden?: boolean }

/** Menú desplegable (acciones de una fila, exportar…). */
export function ActionMenu({ trigger, actions, label, align = 'end' }: { trigger: ReactNode; actions: MenuAction[]; label?: string; align?: 'start' | 'end' }) {
  const visible = actions.filter((action) => !action.hidden)
  if (!visible.length) return null
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger as React.ReactElement} />
      <Menu.Portal>
        <Menu.Positioner align={align} sideOffset={6} className="z-[60] outline-none">
          <Menu.Popup className="min-w-48 origin-[var(--transform-origin)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl outline-none transition-[transform,opacity] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {label && <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>}
            {visible.map(({ label: text, icon: Icon, onSelect, danger }) => (
              <Menu.Item key={text} onClick={onSelect} className={cn('flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium outline-none data-[highlighted]:bg-slate-100', danger ? 'text-red-600' : 'text-slate-700')}>
                {Icon && <Icon className="size-4 opacity-70" />}{text}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Icon className="size-6" /></div>
      <p className="mt-4 text-sm font-semibold text-slate-900">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
