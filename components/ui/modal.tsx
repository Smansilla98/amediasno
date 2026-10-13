'use client'

import { Dialog } from '@base-ui/react/dialog'
import { X, type LucideIcon } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/controls'

const SIZES = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' } as const

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  icon?: LucideIcon
  size?: keyof typeof SIZES
  /** Barra fija de acciones al pie. */
  footer?: ReactNode
  /** Aviso fijo arriba de las acciones: queda a la vista aunque el cuerpo esté desplazado. */
  notice?: ReactNode
  /** Contenido fijo entre el encabezado y el cuerpo (pestañas, resumen). */
  toolbar?: ReactNode
  children: ReactNode
  /** Envuelve cuerpo y pie: lo usa FormModal para que todo sea un <form>. */
  as?: (content: ReactNode) => ReactNode
}

/**
 * Ventana modal. En el celular sube desde abajo como una hoja y ocupa casi toda
 * la pantalla; en escritorio queda centrada. El cuerpo se desplaza y el
 * encabezado y las acciones quedan siempre a la vista.
 */
export function Modal({ open, onClose, title, description, icon: Icon, size = 'md', footer, notice, toolbar, children, as }: ModalProps) {
  const content = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
      {notice && <div className="shrink-0 border-t border-red-200 bg-red-50 px-5 py-2.5 text-sm font-medium text-red-700 sm:px-6" role="alert">{notice}</div>}
      {footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-2xl sm:px-6 sm:py-3.5">{footer}</div>}
    </>
  )
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <Dialog.Popup
            className={cn(
              'flex max-h-[94dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl outline-none sm:max-h-[min(88dvh,860px)] sm:rounded-2xl',
              'transition-[transform,opacity] duration-200 ease-out',
              'data-[starting-style]:translate-y-10 data-[starting-style]:opacity-0 data-[ending-style]:translate-y-10 data-[ending-style]:opacity-0',
              'sm:data-[starting-style]:translate-y-2 sm:data-[starting-style]:scale-[0.98] sm:data-[ending-style]:translate-y-2 sm:data-[ending-style]:scale-[0.98]',
              SIZES[size],
            )}
          >
            <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden" />
            <header className="flex shrink-0 items-start gap-3.5 border-b border-slate-200 px-5 pb-4 pt-3 sm:px-6 sm:pt-5">
              {Icon && <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white"><Icon className="size-[18px]" /></div>}
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-base font-bold leading-tight tracking-tight text-slate-950 sm:text-lg">{title}</Dialog.Title>
                {description && <Dialog.Description className="mt-1 text-sm text-slate-500">{description}</Dialog.Description>}
              </div>
              <Dialog.Close aria-label="Cerrar" className="-mr-1.5 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 outline-none transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-950"><X className="size-5" /></Dialog.Close>
            </header>
            {toolbar && <div className="shrink-0 border-b border-slate-200 px-5 py-3 sm:px-6">{toolbar}</div>}
            {as ? as(content) : content}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

type FormModalProps = Omit<ModalProps, 'footer' | 'as' | 'notice'> & {
  submitLabel: string
  /** Devuelve un mensaje de error para mostrar, o nada si salió bien. */
  onSubmit: (form: FormData) => Promise<string | void>
  /** Texto a la izquierda del pie (totales, avisos). */
  summary?: ReactNode
  submitDisabled?: boolean
}

/** Modal con formulario: maneja el envío, el estado "guardando" y el error. */
export function FormModal({ submitLabel, onSubmit, summary, submitDisabled, children, ...modal }: FormModalProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    const message = await onSubmit(new FormData(event.currentTarget)).catch(() => 'No se pudo guardar. Revisá tu conexión y probá de nuevo.')
    setSaving(false)
    if (message) setError(message)
  }

  return (
    <Modal
      {...modal}
      notice={error || undefined}
      as={(content) => <form onSubmit={submit} noValidate={false} className="flex min-h-0 flex-1 flex-col">{content}</form>}
      footer={<>
        {summary && <div className="w-full min-w-0 text-sm text-slate-600 sm:mr-auto sm:w-auto">{summary}</div>}
        <Button type="button" variant="ghost" onClick={modal.onClose}>Cancelar</Button>
        <Button type="submit" disabled={saving || submitDisabled} className="flex-1 sm:flex-none">{saving ? 'Guardando…' : submitLabel}</Button>
      </>}
    >
      {children}
    </Modal>
  )
}

/** Pregunta de confirmación para acciones que no se deshacen fácil. */
export function ConfirmModal({ open, onClose, title, children, confirmLabel, danger, onConfirm }: { open: boolean; onClose: () => void; title: string; children: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void> }) {
  const [working, setWorking] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<>
      <Button variant="ghost" onClick={onClose}>Volver</Button>
      <Button variant={danger ? 'danger' : 'primary'} className="flex-1 sm:flex-none" disabled={working} onClick={async () => { setWorking(true); await onConfirm(); setWorking(false) }}>{working ? 'Un momento…' : confirmLabel}</Button>
    </>}>
      <div className="text-sm leading-relaxed text-slate-600">{children}</div>
    </Modal>
  )
}
