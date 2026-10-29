'use client'

import { CheckCircle2, CircleAlert } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import useSWR from 'swr'
import { getWorkspace, type Workspace } from '@/app/actions/workspace'
import type { Result } from '@/lib/session'
import { buildView, type View } from '@/lib/view'

/** Qué ventana está abierta. Se apilan: el pago se abre encima del detalle del pedido. */
export type ModalState =
  | { type: 'order' }
  | { type: 'orderDetail'; id: string }
  | { type: 'orderEdit'; id: string }
  | { type: 'payment'; orderId: string }
  | { type: 'customer'; id?: string }
  | { type: 'product'; id?: string }
  | { type: 'stock'; id: string; mode?: 'add' | 'set' }
  | { type: 'sizeChart'; id: string }
  | { type: 'supplier'; id?: string }
  | { type: 'batch'; id?: string; orderIds?: string[] }
  | { type: 'batchDetail'; id: string }
  | { type: 'account'; id?: string }
  | { type: 'expense'; batchId?: string }
  | { type: 'movement'; accountId?: string }
  | { type: 'import'; kind: 'products' | 'customers' }
  | { type: 'more' }
  | { type: 'confirm'; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; run: () => Promise<boolean> }

type Toast = { id: number; message: string; error?: boolean }

type AppContext = {
  view: View
  user: { name: string; email: string }
  section: string
  go: (section: string) => void
  modals: ModalState[]
  open: (modal: ModalState) => void
  close: () => void
  /** Ejecuta una acción del servidor, refresca los datos y avisa. Devuelve el error, si hubo. */
  submit: <T>(action: Promise<Result<T>>, success?: string) => Promise<string | void>
  notify: (message: string, error?: boolean) => void
  refreshing: boolean
}

const Context = createContext<AppContext | null>(null)
export const useApp = () => {
  const value = useContext(Context)
  if (!value) throw new Error('useApp fuera de AppProvider')
  return value
}

export function AppProvider({ initial, user, section, go, children }: { initial: Workspace; user: AppContext['user']; section: string; go: (section: string) => void; children: ReactNode }) {
  const { data, mutate, isValidating } = useSWR('workspace', () => getWorkspace(), { fallbackData: initial, revalidateOnMount: false, revalidateOnFocus: true, dedupingInterval: 4000 })
  const view = useMemo(() => buildView(data), [data])
  const [modals, setModals] = useState<ModalState[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const notify = useCallback((message: string, error?: boolean) => {
    const id = nextId.current++
    setToasts((list) => [...list.slice(-2), { id, message, error }])
    setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), error ? 6000 : 3200)
  }, [])
  const open = useCallback((modal: ModalState) => setModals((list) => [...list, modal]), [])
  const close = useCallback(() => setModals((list) => list.slice(0, -1)), [])

  const submit = useCallback(async <T,>(action: Promise<Result<T>>, success?: string) => {
    const result = await action
    if (!result.ok) return result.error
    await mutate()
    if (success) notify(success)
  }, [mutate, notify])

  const value = useMemo(() => ({ view, user, section, go, modals, open, close, submit, notify, refreshing: isValidating }), [view, user, section, go, modals, open, close, submit, notify, isValidating])

  return (
    <Context.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((toast) => (
          <div key={toast.id} className={`pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl animate-in fade-in slide-in-from-bottom-2 ${toast.error ? 'bg-red-600' : 'bg-slate-950'}`}>
            {toast.error ? <CircleAlert className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />}{toast.message}
          </div>
        ))}
      </div>
    </Context.Provider>
  )
}
