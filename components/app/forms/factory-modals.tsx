'use client'

import { Check, ClipboardCopy, PackageCheck, Pencil, Plus, Receipt, Trash2, Truck, X } from 'lucide-react'
import { useState } from 'react'
import { assignOrdersToBatch, deleteBatch, receiveBatch, removeOrderFromBatch, saveBatch, setBatchStatus } from '@/app/actions/production'
import { emptyLine, filledLines, lineFrom, ProductLines, type Line } from '@/components/app/forms/product-lines'
import { BatchBadge } from '@/components/app/parts'
import { useApp } from '@/components/app/store'
import { WhatsAppLink } from '@/components/app/whatsapp-link'
import { Button, Field, FormSection, Input, Select } from '@/components/ui/controls'
import { FormModal, Modal } from '@/components/ui/modal'
import { formatDate, money, todayISO } from '@/lib/domain'
import type { OrderView } from '@/lib/view'
import { cn } from '@/lib/utils'

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const toStockItems = (lines: Line[]) => filledLines(lines).map((line) => ({ productId: line.productId, size: line.size, quantity: Number(line.quantity) }))
/** Ventas que se pueden encargar: pendientes y con productos del catálogo. */
const pendingOrders = (orders: OrderView[]) => orders.filter((order) => order.status === 'pending' && order.items.length > 0)

function OrderChecklist({ orders, selected, onToggle, canFulfill }: { orders: OrderView[]; selected: Set<string>; onToggle: (id: string) => void; canFulfill: (order: OrderView) => boolean }) {
  if (!orders.length) return <p className="rounded-xl border border-dashed border-slate-300 px-3.5 py-3 text-sm text-slate-500">No hay ventas pendientes para encargar.</p>
  return (
    <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
      {orders.map((order) => (
        <li key={order.id}>
          <label className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50">
            <input type="checkbox" checked={selected.has(order.id)} onChange={() => onToggle(order.id)} className="size-4 shrink-0 accent-slate-950" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{order.code} · {order.customerName}</span><span className="block truncate text-xs text-slate-500">{order.summary}</span></span>
            {canFulfill(order) ? <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">Hay stock</span> : <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-600">{order.units} u.</span>}
          </label>
        </li>
      ))}
    </ul>
  )
}

const useSelection = (initial: string[] = []) => {
  const [selected, setSelected] = useState(() => new Set(initial))
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  return [selected, toggle, setSelected] as const
}

export function BatchForm({ id, orderIds }: { id?: string; orderIds?: string[] }) {
  const { view, close, submit, open } = useApp()
  const batch = id ? view.batches.find((item) => item.id === id) : undefined
  const suppliers = view.suppliers.filter((supplier) => supplier.active || supplier.id === batch?.supplierId)
  const candidates = pendingOrders(view.orders)
  const [selected, toggle] = useSelection(orderIds)
  const [lines, setLines] = useState<Line[]>(() => batch ? batch.stockItems.map((item, index) => lineFrom(index + 1, item)) : orderIds?.length ? [] : [emptyLine()])
  if (!suppliers.length) {
    return (
      <Modal open onClose={close} size="sm" icon={Truck} title="Nuevo pedido a fábrica" footer={<><Button variant="ghost" onClick={close}>Ahora no</Button><Button onClick={() => { close(); open({ type: 'supplier' }) }}><Plus className="size-4" /> Cargar proveedor</Button></>}>
        <p className="text-sm leading-relaxed text-slate-600">Primero cargá la fábrica o proveedor al que le vas a hacer el pedido.</p>
      </Modal>
    )
  }
  const stockUnits = filledLines(lines).reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)
  const orderUnits = candidates.filter((order) => selected.has(order.id)).reduce((sum, order) => sum + order.units, 0)
  return (
    <FormModal open onClose={close} size="lg" icon={Truck} title={batch ? 'Editar pedido a fábrica' : 'Nuevo pedido a fábrica'} description="Para reponer stock, para ventas pendientes o para ambas cosas." submitLabel={batch ? 'Guardar cambios' : 'Crear pedido'}
      summary={stockUnits + orderUnits > 0 ? <><strong className="text-slate-950">{stockUnits + orderUnits} unidades</strong>{stockUnits > 0 && ` · ${stockUnits} para stock`}{selected.size > 0 && ` · ${selected.size} ventas`}</> : undefined}
      onSubmit={(form) => submit(saveBatch({ id, supplierId: text(form, 'supplierId'), name: text(form, 'name'), expectedAt: text(form, 'expectedAt'), notes: text(form, 'notes'), orderIds: [...selected], stockItems: toStockItems(lines) }), batch ? 'Pedido a fábrica actualizado' : 'Pedido a fábrica creado').then((error) => { if (!error) close(); return error })}>
      <div className="space-y-5">
        <FormSection>
          <Field label="Proveedor"><Select name="supplierId" required defaultValue={batch?.supplierId ?? (suppliers.length === 1 ? suppliers[0].id : '')}><option value="" disabled>Elegí…</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></Field>
          <Field label="Nombre"><Input name="name" required defaultValue={batch?.name ?? `Pedido ${formatDate(todayISO()).slice(0, 5)}`} /></Field>
          <Field label="Llega aproximadamente" optional><Input name="expectedAt" type="date" defaultValue={batch?.expectedAt ?? ''} /></Field>
          <Field label="Notas" optional><Input name="notes" defaultValue={batch?.notes ?? ''} /></Field>
        </FormSection>
        <section className="space-y-3 border-t border-slate-200 pt-5">
          <div><h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Reposición de stock</h3><p className="mt-1 text-sm text-slate-500">Lo que querés tener en stock, sin que nadie lo haya pedido. Entra libre al recibirlo.</p></div>
          <ProductLines lines={lines} onChange={setLines} allowEmpty addLabel={lines.length ? 'Agregar otro producto' : 'Agregar producto para stock'} />
        </section>
        <section className="space-y-3 border-t border-slate-200 pt-5">
          <div><h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Ventas pendientes</h3><p className="mt-1 text-sm text-slate-500">Las que elijas se encargan con sus productos y talles, y quedan reservadas al recibir el pedido.{batch && batch.orders.length > 0 && ` Ya incluye ${batch.orders.length}: se quitan desde el detalle.`}</p></div>
          <OrderChecklist orders={candidates} selected={selected} onToggle={toggle} canFulfill={view.canFulfill} />
        </section>
      </div>
    </FormModal>
  )
}

export function BatchDetail({ id }: { id: string }) {
  const { view, close, open, submit, notify } = useApp()
  const batch = view.batches.find((item) => item.id === id)
  const candidates = pendingOrders(view.orders)
  const [adding, setAdding] = useState(false)
  const [selected, toggle, setSelected] = useSelection()
  const [busy, setBusy] = useState(false)
  if (!batch) return null
  const received = batch.status === 'received'
  const act = async (action: Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, message: string) => { setBusy(true); const error = await submit(action, message); setBusy(false); if (error) notify(error, true); return !error }
  const message = [`Hola, te paso el pedido ${batch.name}:`, ...batch.lines.map((line) => `${line.quantity} × ${line.name}${line.size ? ` — talle ${line.size}` : ''}`), `Total: ${batch.units} unidades`].join('\n')
  const copy = () => navigator.clipboard.writeText(message).then(() => notify('Pedido copiado para enviar'), () => notify('No se pudo copiar', true))
  const waiting = batch.orders.filter((order) => order.status === 'in_production').length
  return (
    <Modal open onClose={close} size="lg" icon={Truck} title={batch.name}
      description={<span className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-700">{batch.supplierName}</span><BatchBadge status={batch.status} /><span>{batch.kind}</span>{batch.expectedAt && !received && <span>· llega el {formatDate(batch.expectedAt)}</span>}{received && <span>· recibido el {formatDate(batch.receivedAt)}</span>}</span>}
      footer={<>
        <div className="flex w-full flex-wrap gap-1 sm:mr-auto sm:w-auto">
          {!received && <Button variant="ghost" onClick={() => open({ type: 'batch', id })}><Pencil className="size-4" /> Editar</Button>}
          <Button variant="ghost" onClick={() => open({ type: 'expense', batchId: id })}><Receipt className="size-4" /> Cargar gasto</Button>
          {!received && <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => open({ type: 'confirm', title: `¿Borrar ${batch.name}?`, confirmLabel: 'Borrar pedido', danger: true, body: <>Se borra el encargo.{batch.orders.length > 0 && <> Las <strong>{batch.orders.length} ventas</strong> vuelven a quedar pendientes.</>} Los gastos cargados se conservan.</>, run: async () => { const ok = await act(deleteBatch(id), 'Pedido a fábrica borrado'); if (ok) close(); return ok } })}><Trash2 className="size-4" /> Borrar</Button>}
        </div>
        {batch.status === 'requested' && <Button variant="secondary" disabled={busy} onClick={() => act(setBatchStatus(id, 'in_production'), 'Marcado en producción')}>Ya está en producción</Button>}
        {!received && <Button variant="success" className="flex-1 sm:flex-none" disabled={busy || !batch.units} onClick={() => open({ type: 'confirm', title: `¿Recibir ${batch.name}?`, confirmLabel: 'Sí, llegó todo', body: <>Entran <strong>{batch.units} unidades</strong> al stock.{waiting > 0 && <> Las <strong>{waiting} ventas</strong> del pedido quedan reservadas y listas para entregar.</>} No se puede deshacer: si llegó algo distinto, corregilo después en Stock.</>, run: () => act(receiveBatch(id), 'Mercadería recibida: el stock ya está actualizado') })}><PackageCheck className="size-4" /> Recibir mercadería</Button>}
      </>}>
      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Qué se pide</h3>{batch.lines.length > 0 && <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950"><ClipboardCopy className="size-3.5" /> Copiar</button>}</div>
          {batch.lines.length ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <ul className="divide-y divide-slate-100">
                {batch.lines.map((line) => <li key={`${line.productId}-${line.size}`} className="flex items-center gap-3 px-3.5 py-2.5"><span className="flex h-7 min-w-9 items-center justify-center rounded-lg bg-slate-950 px-1.5 text-xs font-bold tabular-nums text-white">{line.quantity}</span><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{line.name}</span>{line.size && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">{line.size}</span>}</li>)}
              </ul>
              <div className="flex justify-between border-t border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm"><span className="font-semibold text-slate-900">{batch.units} unidades{batch.stockUnits > 0 && <span className="font-normal text-slate-500"> · {batch.stockUnits} para stock</span>}</span>{batch.costCents > 0 && <span className="tabular-nums text-slate-600">Costo {money(batch.costCents)}</span>}</div>
            </div>
          ) : <p className="rounded-xl border border-dashed border-slate-300 px-3.5 py-3 text-sm text-slate-500">Este pedido no tiene productos.</p>}
          <div className="mt-3"><WhatsAppLink phone={batch.supplierContact} label="Enviar pedido por WhatsApp" message={message} /></div>
          {batch.notes && <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">{batch.notes}</p>}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Para ventas ({batch.orders.length})</h3>{!received && candidates.length > 0 && !adding && <button onClick={() => { setSelected(new Set()); setAdding(true) }} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950"><Plus className="size-3.5" /> Sumar ventas</button>}</div>
          {adding ? (
            <div className="space-y-3">
              <OrderChecklist orders={candidates} selected={selected} onToggle={toggle} canFulfill={view.canFulfill} />
              <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button><Button size="sm" disabled={busy || !selected.size} onClick={async () => { if (await act(assignOrdersToBatch({ batchId: id, orderIds: [...selected] }), 'Ventas sumadas al pedido')) setAdding(false) }}><Check className="size-3.5" /> Sumar {selected.size}</Button></div>
            </div>
          ) : batch.orders.length ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {batch.orders.map((order) => (
                <li key={order.id} className="flex items-center gap-2 py-1 pl-3.5 pr-1.5">
                  <button onClick={() => open({ type: 'orderDetail', id: order.id })} className="min-w-0 flex-1 py-1.5 text-left outline-none focus-visible:underline"><span className={cn('block truncate text-sm font-semibold', order.status === 'cancelled' ? 'text-slate-400 line-through' : 'text-slate-900')}>{order.code} · {order.customerName}</span><span className="block truncate text-xs text-slate-500">{order.summary}</span></button>
                  {!received && <button aria-label={`Quitar ${order.code} del pedido`} title="Quitar la venta y sus productos del pedido" disabled={busy} onClick={() => act(removeOrderFromBatch({ batchId: id, orderId: order.id }), 'Venta quitada del pedido')} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 outline-none hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-slate-950"><X className="size-4" /></button>}
                </li>
              ))}
            </ul>
          ) : <p className="rounded-xl border border-dashed border-slate-300 px-3.5 py-3 text-sm text-slate-500">{batch.stockUnits ? 'Pedido solo para reponer stock.' : 'Sin ventas.'}</p>}
        </section>
      </div>
    </Modal>
  )
}
