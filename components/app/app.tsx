'use client'

import Image from 'next/image'
import { BarChart3, Download, Factory, Landmark, LayoutDashboard, LoaderCircle, Menu as MenuIcon, Plus, Receipt, Shirt, ShoppingBag, Truck, UserRound, Users, WalletCards, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { Workspace } from '@/app/actions/workspace'
import { AccountForm, BatchDetail, BatchForm, CustomerForm, ExpenseForm, MovementForm, ProductForm, SizeChartModal, StockForm, SupplierForm } from '@/components/app/forms/other-modals'
import { OrderDetail, OrderEditForm, OrderForm, PaymentForm } from '@/components/app/forms/order-modals'
import { Account, Batches, Cash, EXPORTS, FORMATS, Payments, Reports, Suppliers, download } from '@/components/app/sections/business'
import { Catalog, Customers, Orders, Overview } from '@/components/app/sections/operations'
import { AppProvider, useApp, type ModalState } from '@/components/app/store'
import { ActionMenu, Button } from '@/components/ui/controls'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

type Section = { id: string; label: string; icon: LucideIcon; group: string; view: () => React.ReactNode; exports?: string }

const SECTIONS: Section[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard, group: 'Día a día', view: Overview, exports: 'pedidos' },
  { id: 'pedidos', label: 'Pedidos', icon: ShoppingBag, group: 'Día a día', view: Orders, exports: 'pedidos' },
  { id: 'clientes', label: 'Clientes', icon: Users, group: 'Día a día', view: Customers, exports: 'clientes' },
  { id: 'catalogo', label: 'Catálogo', icon: Shirt, group: 'Día a día', view: Catalog, exports: 'productos' },
  { id: 'tandas', label: 'Tandas de fábrica', icon: Truck, group: 'Producción', view: Batches, exports: 'tandas' },
  { id: 'proveedores', label: 'Proveedores', icon: Factory, group: 'Producción', view: Suppliers },
  { id: 'pagos', label: 'Pagos', icon: WalletCards, group: 'Plata', view: Payments, exports: 'pagos' },
  { id: 'caja', label: 'Caja', icon: Landmark, group: 'Plata', view: Cash, exports: 'caja' },
  { id: 'reportes', label: 'Reportes', icon: BarChart3, group: 'Plata', view: Reports },
  { id: 'cuenta', label: 'Mi cuenta', icon: UserRound, group: 'Cuenta', view: Account },
]
const sectionOf = (id: string | null | undefined) => SECTIONS.find((section) => section.id === id) ?? SECTIONS[0]

export function App({ initial, user, section: initialSection }: { initial: Workspace; user: { name: string; email: string }; section?: string }) {
  const [section, setSection] = useState(sectionOf(initialSection).id)
  const go = useCallback((id: string) => {
    setSection(id)
    window.history.pushState(null, '', id === 'resumen' ? '/' : `/?v=${id}`)
    window.scrollTo({ top: 0 })
  }, [])
  useEffect(() => {
    const sync = () => setSection(sectionOf(new URLSearchParams(window.location.search).get('v')).id)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  return <AppProvider initial={initial} user={user} section={section} go={go}><Shell /></AppProvider>
}

function Shell() {
  const { section, go, view, user, open, refreshing } = useApp()
  const current = sectionOf(section)
  const View = current.view
  const badge = (id: string) => id === 'pedidos' ? view.totals.open : id === 'tandas' ? view.totals.unbatched : id === 'pagos' ? view.totals.owing : 0
  const groups = [...new Set(SECTIONS.map((item) => item.group))].filter((group) => group !== 'Cuenta')
  const today = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())

  const navButton = (item: Section) => {
    const count = badge(item.id)
    return (
      <button key={item.id} onClick={() => go(item.id)} aria-current={section === item.id ? 'page' : undefined} className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-slate-950', section === item.id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950')}>
        <item.icon className="size-[17px] shrink-0" /><span className="truncate">{item.label}</span>
        {count > 0 && <span className={cn('ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums', section === item.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700')}>{count}</span>}
      </button>
    )
  }

  return (
    <div className="min-h-dvh bg-[#f6f7f9] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-[68px] shrink-0 items-center gap-3 border-b border-slate-100 px-5">
          <Image src="/medias-logo.jpg" alt="" width={38} height={38} className="rounded-full object-cover" />
          <div><p className="text-[15px] font-bold leading-tight tracking-tight">Medias</p><p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">Gestión de pedidos</p></div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Secciones">
          {groups.map((group) => <div key={group}><p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{group}</p><div className="space-y-0.5">{SECTIONS.filter((item) => item.group === group).map(navButton)}</div></div>)}
        </nav>
        <div className="shrink-0 border-t border-slate-100 p-3">
          <button onClick={() => go('cuenta')} aria-current={section === 'cuenta' ? 'page' : undefined} className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950', section === 'cuenta' && 'bg-slate-100')}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-lime-200 text-xs font-bold text-lime-900">{user.name.slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-slate-500">{user.email}</p></div>
          </button>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:h-[68px] sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Image src="/medias-logo.jpg" alt="" width={34} height={34} className="shrink-0 rounded-full object-cover lg:hidden" />
            <div className="min-w-0"><h1 className="truncate text-base font-bold tracking-tight sm:text-lg">{current.label}</h1><p className="hidden truncate text-xs text-slate-500 first-letter:uppercase sm:block">{today}</p></div>
            {refreshing && <LoaderCircle aria-label="Actualizando" className="size-4 shrink-0 animate-spin text-slate-400" />}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {current.exports && <ActionMenu label={`Descargar ${EXPORTS.find(([kind]) => kind === current.exports)?.[1].toLowerCase()}`} trigger={<Button variant="secondary" aria-label="Descargar"><Download className="size-4" /><span className="hidden sm:inline">Descargar</span></Button>} actions={FORMATS.map(([format, label]) => ({ label, onSelect: () => download(current.exports!, format) }))} />}
            <div className="hidden lg:block">
              <ActionMenu label="Cargar" trigger={<Button><Plus className="size-4" /> Nuevo</Button>} actions={[
                { label: 'Pedido', icon: ShoppingBag, onSelect: () => open({ type: 'order' }) },
                { label: 'Cliente', icon: Users, onSelect: () => open({ type: 'customer' }) },
                { label: 'Producto', icon: Shirt, onSelect: () => open({ type: 'product' }) },
                { label: 'Tanda de fábrica', icon: Truck, onSelect: () => open({ type: 'batch' }) },
                { label: 'Gasto', icon: Receipt, onSelect: () => open({ type: 'expense' }) },
              ]} />
            </div>
          </div>
        </header>
        <main><View /></main>
      </div>

      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end border-t border-slate-200 bg-white/95 px-1 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden">
        {[sectionOf('resumen'), sectionOf('pedidos')].map((item) => <MobileTab key={item.id} item={item} active={section === item.id} onClick={() => go(item.id)} />)}
        <div className="flex justify-center"><button onClick={() => open({ type: 'order' })} aria-label="Nuevo pedido" className="-mt-5 flex size-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg shadow-slate-950/25 outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"><Plus className="size-6" /></button></div>
        <MobileTab item={sectionOf('pagos')} active={section === 'pagos'} onClick={() => go('pagos')} />
        <MobileTab item={{ ...sectionOf('cuenta'), label: 'Más', icon: MenuIcon }} active={!['resumen', 'pedidos', 'pagos'].includes(section)} onClick={() => open({ type: 'more' })} />
      </nav>

      <ModalHost />
    </div>
  )
}

function MobileTab({ item, active, onClick }: { item: Section; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} aria-current={active ? 'page' : undefined} className={cn('flex min-w-0 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold outline-none transition focus-visible:bg-slate-100', active ? 'text-slate-950' : 'text-slate-400')}><item.icon className="size-5" /><span className="max-w-full truncate">{item.label}</span></button>
}

function MoreSheet() {
  const { close, go, section, open } = useApp()
  const rest = SECTIONS.filter((item) => !['resumen', 'pedidos', 'pagos'].includes(item.id))
  return (
    <Modal open onClose={close} title="Más" size="sm">
      <div className="grid grid-cols-3 gap-2">
        {rest.map((item) => <button key={item.id} onClick={() => { close(); go(item.id) }} className={cn('flex flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-center text-xs font-semibold outline-none transition active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-slate-950', section === item.id ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 text-slate-700')}><item.icon className="size-5" />{item.label}</button>)}
      </div>
      <h3 className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Cargar</h3>
      <div className="grid grid-cols-2 gap-2">
        {([['Cliente', Users, { type: 'customer' }], ['Producto', Shirt, { type: 'product' }], ['Tanda', Truck, { type: 'batch' }], ['Gasto', Receipt, { type: 'expense' }]] as [string, LucideIcon, ModalState][]).map(([label, Icon, modal]) => <Button key={label} variant="secondary" className="justify-start" onClick={() => { close(); open(modal) }}><Icon className="size-4" /> {label}</Button>)}
      </div>
    </Modal>
  )
}

function ModalHost() {
  const { modals, close } = useApp()
  return <>{modals.map((modal, index) => <ModalView key={index} modal={modal} close={close} />)}</>
}

function ModalView({ modal, close }: { modal: ModalState; close: () => void }) {
  switch (modal.type) {
    case 'order': return <OrderForm />
    case 'orderDetail': return <OrderDetail id={modal.id} />
    case 'orderEdit': return <OrderEditForm id={modal.id} />
    case 'payment': return <PaymentForm orderId={modal.orderId} />
    case 'customer': return <CustomerForm id={modal.id} />
    case 'product': return <ProductForm id={modal.id} />
    case 'stock': return <StockForm id={modal.id} />
    case 'sizeChart': return <SizeChartModal id={modal.id} />
    case 'supplier': return <SupplierForm id={modal.id} />
    case 'batch': return <BatchForm id={modal.id} />
    case 'batchDetail': return <BatchDetail id={modal.id} />
    case 'account': return <AccountForm id={modal.id} />
    case 'expense': return <ExpenseForm batchId={modal.batchId} />
    case 'movement': return <MovementForm accountId={modal.accountId} />
    case 'more': return <MoreSheet />
    case 'confirm': return <ConfirmModal open onClose={close} title={modal.title} confirmLabel={modal.confirmLabel} danger={modal.danger} onConfirm={async () => { if (await modal.run()) close() }}>{modal.body}</ConfirmModal>
  }
}
