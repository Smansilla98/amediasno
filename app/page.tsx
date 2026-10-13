'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  BarChart3,
  Bell,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  Filter,
  LayoutDashboard,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Settings2,
  Shirt,
  ShoppingBag,
  SlidersHorizontal,
  Tag,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react'

const orders = [
  { id: 'PED-1048', customer: 'Sandra Castro', product: 'Remera oversize', size: 'M', color: 'Palomar', date: '30/08/2026', total: 40000, paid: 40000, status: 'Pagado', channel: 'Instagram' },
  { id: 'PED-1047', customer: 'Nicolás Ríos', product: 'Buzo canguro', size: 'L', color: 'Negro', date: '29/08/2026', total: 68000, paid: 34000, status: 'Seña', channel: 'WhatsApp' },
  { id: 'PED-1046', customer: 'Gabriela González', product: 'Remera clásica', size: 'M', color: 'Palomar', date: '28/08/2026', total: 40000, paid: 0, status: 'Pendiente', channel: 'Instagram' },
  { id: 'PED-1045', customer: 'Anastasia Street', product: 'Pantalón cargo', size: 'S', color: 'Avellaneda', date: '28/08/2026', total: 72000, paid: 72000, status: 'Pagado', channel: 'Web' },
  { id: 'PED-1044', customer: 'Mati Varela', product: 'Campera denim', size: 'M', color: 'Verde', date: '27/08/2026', total: 94000, paid: 47000, status: 'Seña', channel: 'Instagram' },
  { id: 'PED-1043', customer: 'Agustina Martínez', product: 'Hoodie básico', size: 'S', color: 'Palomar', date: '26/08/2026', total: 65000, paid: 65000, status: 'Pagado', channel: 'Instagram' },
  { id: 'PED-1042', customer: 'Enzo Ríos', product: 'Remera clásica', size: 'XL', color: 'Negro', date: '26/08/2026', total: 40000, paid: 0, status: 'Pendiente', channel: 'WhatsApp' },
  { id: 'PED-1041', customer: 'Ivan', product: 'Camisa lino', size: 'XL', color: 'Avellaneda', date: '25/08/2026', total: 78000, paid: 78000, status: 'Pagado', channel: 'Web' },
]

const navItems = [
  { label: 'Resumen', icon: LayoutDashboard, active: true },
  { label: 'Pedidos', icon: ShoppingBag },
  { label: 'Clientes', icon: Users },
  { label: 'Catálogo', icon: Shirt },
  { label: 'Pagos', icon: WalletCards },
]

const formatMoney = (value: number) => `$${value.toLocaleString('es-AR')}`

export default function Page() {
  const [activeNav, setActiveNav] = useState('Resumen')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Todos')
  const [showExport, setShowExport] = useState(false)

  const filteredOrders = useMemo(() => orders.filter((order) => {
    const matchesQuery = `${order.customer} ${order.product} ${order.id}`.toLowerCase().includes(query.toLowerCase())
    const matchesStatus = status === 'Todos' || order.status === status
    return matchesQuery && matchesStatus
  }), [query, status])

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-900">
      <aside className="fixed inset-y-0 left-0 hidden w-[232px] border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-[78px] items-center gap-3 border-b border-slate-100 px-6">
          <Image src="/medias-logo.jpg" alt="Logo Medias" width={42} height={42} className="rounded-full object-cover" />
          <div><p className="text-[15px] font-bold tracking-tight">Medias</p><p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">gestión simple</p></div>
        </div>
        <div className="flex flex-1 flex-col px-3 py-5">
          <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
          <nav className="flex flex-col gap-1">
            {navItems.map(({ label, icon: Icon, active }) => <button key={label} onClick={() => setActiveNav(label)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition ${activeNav === label || (active && activeNav === 'Resumen') ? 'bg-slate-100 text-slate-950' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><Icon className="size-[17px]" />{label}{label === 'Pedidos' && <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">24</span>}</button>)}
          </nav>
          <p className="mt-8 px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Análisis</p>
          <nav className="flex flex-col gap-1">
            <button className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-slate-500 hover:bg-slate-50"><BarChart3 className="size-[17px]" />Reportes</button>
            <button className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-slate-500 hover:bg-slate-50"><Tag className="size-[17px]" />Costos y márgenes</button>
          </nav>
          <div className="mt-auto rounded-xl bg-slate-950 p-4 text-white"><p className="text-xs font-semibold">Tu plan: Emprendedor</p><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Pedidos ilimitados y exportaciones activas.</p><button className="mt-3 text-[11px] font-bold text-white underline underline-offset-4">Administrar plan</button></div>
        </div>
        <div className="border-t border-slate-100 p-3"><button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50"><div className="flex size-8 items-center justify-center rounded-full bg-[#d9f99d] text-xs font-bold text-lime-900">SC</div><div className="min-w-0"><p className="truncate text-xs font-semibold">Sandra Castro</p><p className="truncate text-[11px] text-slate-400">Administradora</p></div><MoreHorizontal className="ml-auto size-4 text-slate-400" /></button></div>
      </aside>

      <section className="lg:pl-[232px]">
        <header className="sticky top-0 z-20 flex min-h-[70px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:h-[78px] sm:px-8"><div className="flex items-center gap-3"><Image src="/medias-logo.jpg" alt="Logo Medias" width={38} height={38} className="rounded-full object-cover lg:hidden" /><div><p className="text-[11px] font-medium text-slate-400 sm:text-xs">Viernes, 30 de agosto de 2026</p><h1 className="mt-1 text-lg font-bold tracking-tight sm:text-xl">{activeNav === 'Resumen' ? 'Resumen general' : activeNav}</h1></div></div><div className="flex items-center gap-3"><button className="hidden rounded-lg border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50 sm:block"><Bell className="size-[17px]" /></button><button className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:flex"><Settings2 className="size-4" /> Configuración</button><button onClick={() => setShowExport(!showExport)} className="flex items-center gap-2 rounded-lg bg-slate-950 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"><Download className="size-4" /> Exportar <ChevronDown className="size-3.5" /></button></div></header>
        {showExport && <div className="absolute right-5 top-[66px] z-10 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"><p className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Descargar como</p>{['Excel (.xlsx)', 'CSV (.csv)', 'PDF (.pdf)', 'JSON (.json)'].map((item) => <button key={item} onClick={() => setShowExport(false)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50"><FileSpreadsheet className="size-3.5 text-slate-400" />{item}</button>)}</div>}
        <div className="mx-auto max-w-[1440px] space-y-6 p-4 pb-24 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[{ label: 'Ventas del mes', value: '$1.248.500', detail: '+18,4% vs. mes anterior', icon: CircleDollarSign, tone: 'bg-[#e8f5bd]', iconTone: 'text-lime-800' }, { label: 'Pedidos activos', value: '24', detail: '8 requieren seguimiento', icon: ShoppingBag, tone: 'bg-[#e8edff]', iconTone: 'text-indigo-700' }, { label: 'Por cobrar', value: '$486.000', detail: '12 pedidos con saldo', icon: WalletCards, tone: 'bg-[#fff1d6]', iconTone: 'text-amber-700' }, { label: 'Margen promedio', value: '42,8%', detail: '+3,2% este mes', icon: TrendingUp, tone: 'bg-[#e8f7f1]', iconTone: 'text-emerald-700' }].map(({ label, value, detail, icon: Icon, tone, iconTone }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p></div><div className={`flex size-10 items-center justify-center rounded-xl ${tone} ${iconTone}`}><Icon className="size-[18px]" /></div></div><p className="mt-4 text-[11px] font-medium text-slate-400"><span className={detail.includes('+') ? 'text-emerald-600' : 'text-slate-500'}>{detail}</span></p></div>)}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white"><div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-bold text-slate-950">Pedidos recientes</h2><p className="mt-1 text-xs text-slate-400">Seguimiento de tus últimas ventas</p></div><button className="flex w-fit items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"><Plus className="size-3.5" /> Nuevo pedido</button></div><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por cliente, producto o ID..." className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none placeholder:text-slate-400 focus:border-slate-400" /></div><div className="flex gap-2"><div className="relative"><Filter className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /><select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs font-medium text-slate-600 outline-none"><option>Todos</option><option>Pagado</option><option>Seña</option><option>Pendiente</option></select></div><button className="rounded-lg border border-slate-200 px-3 text-slate-500 hover:bg-slate-50"><SlidersHorizontal className="size-4" /></button></div></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="px-5 py-3">Pedido</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Producto</th><th className="px-3 py-3">Talle</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3"></th></tr></thead><tbody>{filteredOrders.map((order) => <tr key={order.id} className="border-b border-slate-50 text-xs transition hover:bg-slate-50/70"><td className="px-5 py-4 font-semibold text-slate-700">{order.id}</td><td className="px-3 py-4"><p className="font-semibold text-slate-800">{order.customer}</p><p className="mt-0.5 text-[10px] text-slate-400">{order.channel}</p></td><td className="px-3 py-4 text-slate-500">{order.product}<span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{order.color}</span></td><td className="px-3 py-4 font-semibold text-slate-600">{order.size}</td><td className="px-3 py-4 text-slate-400">{order.date}</td><td className="px-3 py-4 font-semibold text-slate-700">{formatMoney(order.total)}</td><td className="px-3 py-4"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${order.status === 'Pagado' ? 'bg-emerald-50 text-emerald-700' : order.status === 'Seña' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{order.status}{order.status === 'Seña' && <span className="ml-1 opacity-60">· {formatMoney(order.paid)}</span>}</span></td><td className="px-3 py-4"><button className="text-slate-400 hover:text-slate-800"><MoreHorizontal className="size-4" /></button></td></tr>)}</tbody></table></div><div className="flex items-center justify-between p-4"><p className="text-[11px] text-slate-400">Mostrando <span className="font-semibold text-slate-600">{filteredOrders.length}</span> de 24 pedidos</p><button className="text-xs font-semibold text-slate-700 underline underline-offset-4">Ver todos los pedidos</button></div></div>

            <div className="space-y-6"><div className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold">Ingresos</h2><p className="mt-1 text-xs text-slate-400">Últimos 6 meses</p></div><button className="text-slate-400"><MoreHorizontal className="size-4" /></button></div><div className="mt-6 flex h-36 items-end justify-between gap-2 px-1">{[42, 58, 49, 73, 64, 88].map((height, index) => <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><div className={`w-full max-w-7 rounded-t-md ${index === 5 ? 'bg-slate-950' : 'bg-slate-200'}`} style={{ height: `${height}%` }} /><span className="text-[10px] text-slate-400">{['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago'][index]}</span></div>)}</div><div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4"><span className="size-2 rounded-full bg-slate-950" /><span className="text-[11px] text-slate-500">Ventas</span><span className="ml-auto text-[11px] font-semibold text-emerald-600">+18,4%</span></div></div><div className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><div className="flex size-8 items-center justify-center rounded-lg bg-[#fff1d6] text-amber-700"><Package className="size-4" /></div><div><h2 className="text-sm font-bold">Por cobrar</h2><p className="text-[11px] text-slate-400">Seguimiento de saldos</p></div></div><div className="mt-5 flex items-end justify-between"><p className="text-2xl font-bold tracking-tight">$486.000</p><p className="text-xs font-semibold text-amber-600">12 pedidos</p></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[62%] rounded-full bg-amber-400" /></div><div className="mt-3 flex justify-between text-[10px] text-slate-400"><span>Pagado 62%</span><span>Restante 38%</span></div></div></div>
          </div>
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-6px_20px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden" aria-label="Navegación principal">
          {navItems.slice(0, 5).map(({ label, icon: Icon }) => <button key={label} onClick={() => setActiveNav(label)} className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition ${activeNav === label ? 'text-slate-950' : 'text-slate-400'}`} aria-label={label}><Icon className="size-[18px]" /><span className="max-w-full truncate">{label}</span></button>)}
        </nav>
      </section>
    </main>
  )
}
