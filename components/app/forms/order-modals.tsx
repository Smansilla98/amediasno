'use client'

import { Ban, Check, CircleDollarSign, Factory, MessageCircle, MoreHorizontal, PackageCheck, Pencil, RotateCcw, ShoppingBag, Undo2, WalletCards } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createOrder, recordPayment, setOrderStatus, updateOrder, voidPayment } from '@/app/actions/orders'
import { emptyLine, filledLines, lineFrom, linesTotal, ProductLines, useLineStock, type Line } from '@/components/app/forms/product-lines'
import { useApp } from '@/components/app/store'
import { OrderBadge, PaymentBadge } from '@/components/app/parts'
import { ActionMenu, Button, Field, FormSection, Input, MoneyInput, Select, Textarea } from '@/components/ui/controls'
import { FormModal, Modal } from '@/components/ui/modal'
import { ORDER_STATUS, PAYMENT_METHODS, formatDate, money, toCents, todayISO, type OrderStatus } from '@/lib/domain'
import { whatsappUrl } from '@/lib/whatsapp'
import { cn } from '@/lib/utils'

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const toItems = (lines: Line[]) => filledLines(lines).map((line) => ({ productId: line.productId, size: line.size, quantity: Number(line.quantity), unitPriceCents: toCents(line.price) }))
type Fulfillment = 'pending' | 'ready' | 'delivered'

const FULFILLMENT: { value: Fulfillment; title: string; body: string; needsStock: boolean }[] = [
  { value: 'delivered', title: 'Entregar ahora', body: 'Se lo lleva hoy. Descuenta el stock.', needsStock: true },
  { value: 'ready', title: 'Reservar', body: 'Separa las unidades del stock y se entrega después.', needsStock: true },
  { value: 'pending', title: 'Queda pendiente', body: 'Falta mercadería: después la encargás a fábrica.', needsStock: false },
]

export function OrderForm() {
  const { view, close, submit, open } = useApp()
  const products = view.products.filter((product) => product.active)
  const accounts = view.accounts.filter((account) => account.active)
  const [newCustomer, setNewCustomer] = useState(view.customers.length === 0)
  const [lines, setLines] = useState<Line[]>(products.length ? [emptyLine()] : [])
  const [manualTotal, setManualTotal] = useState('')
  const [deposit, setDeposit] = useState('')
  const [choice, setChoice] = useState<Fulfillment | null>(null)
  const { allInStock } = useLineStock(lines)

  const filled = filledLines(lines)
  const totalCents = filled.length ? linesTotal(lines) : toCents(manualTotal) || 0
  const depositCents = toCents(deposit) || 0
  // Sin productos del catálogo no hay stock que controlar.
  const stockOk = !filled.length || allInStock
  const allowed = (value: Fulfillment) => !FULFILLMENT.find((option) => option.value === value)?.needsStock || stockOk
  // Si no elegiste nada (o lo elegido dejó de ser posible), se sugiere según el stock.
  const fulfillment: Fulfillment = choice && allowed(choice) ? choice : filled.length && allInStock ? 'delivered' : 'pending'

  return (
    <FormModal
      open onClose={close} size="lg" icon={ShoppingBag} title="Nueva venta" description="El código se asigna solo al guardar." submitLabel={fulfillment === 'delivered' ? 'Guardar y entregar' : fulfillment === 'ready' ? 'Guardar y reservar' : 'Guardar venta'}
      summary={<span className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 tabular-nums"><span>Total <strong className="text-base text-slate-950">{money(totalCents)}</strong></span>{depositCents > 0 && <span className="text-slate-500">Saldo {money(Math.max(0, totalCents - depositCents))}</span>}</span>}
      onSubmit={(form) => submit(createOrder({
        fulfillment,
        customerId: newCustomer ? undefined : text(form, 'customerId') || undefined,
        newCustomer: newCustomer ? { name: text(form, 'customerName'), phone: text(form, 'customerPhone') } : undefined,
        firstName: text(form, 'firstName'), lastName: text(form, 'lastName'), block: text(form, 'block'), professor: text(form, 'professor'), venue: text(form, 'venue'),
        deliveryDate: text(form, 'deliveryDate'), notes: text(form, 'notes'),
        items: toItems(lines),
        manualTotalCents: filled.length ? undefined : toCents(manualTotal),
        depositCents, method: text(form, 'method'), accountId: text(form, 'accountId') || undefined,
      }), fulfillment === 'delivered' ? 'Venta entregada: stock descontado' : fulfillment === 'ready' ? 'Venta guardada con stock reservado' : 'Venta guardada como pendiente').then((error) => { if (!error) close(); return error })}
    >
      <div className="space-y-5">
        <FormSection title="Cliente">
          {newCustomer ? <>
            <Field label="Nombre y apellido"><Input name="customerName" required autoFocus placeholder="Quien compra" /></Field>
            <Field label="Teléfono" optional><Input name="customerPhone" type="tel" inputMode="tel" placeholder="11 5555 5555" /></Field>
          </> : (
            <Field label="Cliente" className="sm:col-span-2">
              <Select name="customerId" required defaultValue=""><option value="" disabled>Elegí un cliente…</option>{view.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}</Select>
            </Field>
          )}
          {view.customers.length > 0 && <button type="button" onClick={() => setNewCustomer(!newCustomer)} className="w-fit text-left text-sm font-semibold text-slate-950 underline underline-offset-4 sm:col-span-2">{newCustomer ? 'Elegir un cliente que ya existe' : '+ Cargar un cliente nuevo'}</button>}
        </FormSection>

        <section className="border-t border-slate-200 pt-5">
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Productos</h3>
          {products.length === 0 ? (
            <div className="space-y-4">
              <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600">Todavía no cargaste productos. Podés guardar la venta con un total a mano, o <button type="button" onClick={() => { close(); open({ type: 'product' }) }} className="font-semibold text-slate-950 underline underline-offset-4">crear un producto primero</button>.</p>
              <Field label="Total de la venta" className="sm:max-w-xs"><MoneyInput value={manualTotal} onChange={(event) => setManualTotal(event.target.value)} required /></Field>
            </div>
          ) : <ProductLines lines={lines} onChange={setLines} withPrice showStock />}
        </section>

        <section className="border-t border-slate-200 pt-5">
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">¿Cómo sigue?</h3>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Cómo sigue la venta">
            {FULFILLMENT.map((option) => {
              const enabled = allowed(option.value)
              const checked = fulfillment === option.value
              return (
                <label key={option.value} className={cn('flex cursor-pointer flex-col gap-1 rounded-xl border p-3.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-slate-950', checked ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white hover:bg-slate-50', !enabled && 'cursor-not-allowed opacity-45 hover:bg-white')}>
                  <input type="radio" name="fulfillment" value={option.value} checked={checked} disabled={!enabled} onChange={() => setChoice(option.value)} className="sr-only" />
                  <span className="text-sm font-bold">{option.title}</span>
                  <span className={cn('text-xs leading-snug', checked ? 'text-slate-300' : 'text-slate-500')}>{enabled ? option.body : 'No alcanza el stock disponible.'}</span>
                </label>
              )
            })}
          </div>
        </section>

        <FormSection title="Cobro">
          <Field label="Cobrado ahora" optional hint={totalCents > 0 && <button type="button" onClick={() => setDeposit(String(totalCents / 100).replace('.', ','))} className="font-semibold text-slate-700 underline underline-offset-2">Cobrar el total</button>}><MoneyInput name="deposit" value={deposit} onChange={(event) => setDeposit(event.target.value)} /></Field>
          <Field label="Medio de pago"><Select name="method" defaultValue="Efectivo">{PAYMENT_METHODS.map((item) => <option key={item}>{item}</option>)}</Select></Field>
          {accounts.length > 0 && <Field label="Entra en la cuenta" optional className="sm:col-span-2"><Select name="accountId" defaultValue=""><option value="">No registrar en caja</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></Field>}
        </FormSection>

        <details className="group border-t border-slate-200 pt-5">
          <summary className="cursor-pointer list-none text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 outline-none focus-visible:text-slate-950">Más datos <span className="font-normal normal-case tracking-normal">(para quién, bloque, sede, fecha de entrega, notas)</span></summary>
          <div className="mt-4 grid gap-x-4 gap-y-4 sm:grid-cols-2">
            <Field label="Nombre" optional hint="Si lo dejás vacío se usa el nombre del cliente."><Input name="firstName" placeholder="Alumno/a" /></Field>
            <Field label="Apellido" optional><Input name="lastName" /></Field>
            <Field label="Bloque" optional><Input name="block" placeholder="Bloque o curso" /></Field>
            <Field label="Profesor/a" optional><Input name="professor" /></Field>
            <Field label="Sede" optional><Input name="venue" /></Field>
            <Field label="Fecha de entrega" optional><Input name="deliveryDate" type="date" min={todayISO()} /></Field>
            <Field label="Notas" optional className="sm:col-span-2"><Textarea name="notes" placeholder="Aclaraciones de la venta" /></Field>
          </div>
        </details>
      </div>
    </FormModal>
  )
}

export function OrderEditForm({ id }: { id: string }) {
  const { view, close, submit } = useApp()
  const order = view.orderById.get(id)
  const editItems = order?.status === 'pending' && order.items.length > 0
  const [lines, setLines] = useState<Line[]>(() => order?.items.map((item, index) => lineFrom(index + 1, item)) ?? [])
  if (!order) return null
  return (
    <FormModal open onClose={close} size={editItems ? 'lg' : 'md'} icon={Pencil} title={`Editar ${order.code}`} description={editItems ? 'Podés corregir productos, talles y precios mientras la venta está pendiente.' : 'Los productos solo se cambian con la venta pendiente.'} submitLabel="Guardar cambios"
      summary={editItems ? <>Nuevo total <strong className="text-slate-950">{money(linesTotal(lines))}</strong></> : undefined}
      onSubmit={(form) => submit(updateOrder({ id, firstName: text(form, 'firstName'), lastName: text(form, 'lastName'), block: text(form, 'block'), professor: text(form, 'professor'), venue: text(form, 'venue'), deliveryDate: text(form, 'deliveryDate'), notes: text(form, 'notes'), items: editItems ? toItems(lines) : undefined }), 'Venta actualizada').then((error) => { if (!error) close(); return error })}>
      <div className="space-y-5">
        {editItems && <section><h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Productos</h3><ProductLines lines={lines} onChange={setLines} withPrice showStock excludeOrderId={id} /></section>}
        <FormSection title={editItems ? 'Datos' : undefined}>
          <Field label="Nombre"><Input name="firstName" required defaultValue={order.firstName ?? ''} /></Field>
          <Field label="Apellido" optional><Input name="lastName" defaultValue={order.lastName ?? ''} /></Field>
          <Field label="Bloque" optional><Input name="block" defaultValue={order.block ?? ''} /></Field>
          <Field label="Profesor/a" optional><Input name="professor" defaultValue={order.professor ?? ''} /></Field>
          <Field label="Sede" optional><Input name="venue" defaultValue={order.venue ?? ''} /></Field>
          <Field label="Fecha de entrega" optional><Input name="deliveryDate" type="date" defaultValue={order.deliveryDate ?? ''} /></Field>
          <Field label="Notas" optional className="sm:col-span-2"><Textarea name="notes" defaultValue={order.notes ?? ''} /></Field>
        </FormSection>
      </div>
    </FormModal>
  )
}

export function PaymentForm({ orderId }: { orderId: string }) {
  const { view, close, submit } = useApp()
  const order = view.orderById.get(orderId)
  const accounts = view.accounts.filter((account) => account.active)
  const [value, setValue] = useState(order ? String(order.balanceCents / 100).replace('.', ',') : '')
  if (!order) return null
  const cents = toCents(value) || 0
  return (
    <FormModal open onClose={close} size="sm" icon={CircleDollarSign} title="Registrar pago" description={`${order.code} · ${order.customerName}`} submitLabel="Registrar pago" submitDisabled={cents <= 0}
      summary={cents > 0 && cents < order.balanceCents ? <>Quedará un saldo de <strong>{money(order.balanceCents - cents)}</strong></> : undefined}
      onSubmit={(form) => submit(recordPayment({ orderId, amountCents: cents, method: text(form, 'method'), accountId: text(form, 'accountId') || undefined, notes: text(form, 'notes') }), 'Pago registrado').then((error) => { if (!error) close(); return error })}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-slate-50 text-center">
          {[['Total', order.totalCents], ['Pagado', order.paidCents], ['Saldo', order.balanceCents]].map(([label, amount]) => <div key={label} className="px-2 py-3"><p className="text-[11px] font-medium text-slate-500">{label}</p><p className="mt-0.5 text-sm font-bold tabular-nums text-slate-950">{money(Number(amount))}</p></div>)}
        </div>
        <Field label="Importe"><MoneyInput value={value} onChange={(event) => setValue(event.target.value)} required autoFocus className="h-12 text-lg font-semibold sm:h-12 sm:text-lg" /></Field>
        <Field label="Medio de pago"><Select name="method" defaultValue="Efectivo">{PAYMENT_METHODS.map((item) => <option key={item}>{item}</option>)}</Select></Field>
        {accounts.length > 0 && <Field label="Entra en la cuenta" optional><Select name="accountId" defaultValue=""><option value="">No registrar en caja</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></Field>}
        <Field label="Notas" optional><Input name="notes" placeholder="Comprobante, quién pagó…" /></Field>
      </div>
    </FormModal>
  )
}

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'pending', label: 'Pendiente' },
  { status: 'in_production', label: 'En fábrica' },
  { status: 'ready', label: 'Reservada' },
  { status: 'delivered', label: 'Entregada' },
]

export function OrderDetail({ id }: { id: string }) {
  const { view, close, open, submit, notify } = useApp()
  const order = view.orderById.get(id)
  const payments = useMemo(() => view.payments.filter((payment) => payment.orderId === id), [view.payments, id])
  const [busy, setBusy] = useState(false)
  if (!order) return null

  const cancelled = order.status === 'cancelled'
  const step = STEPS.findIndex((item) => item.status === order.status)
  const paidPct = order.totalCents > 0 ? Math.min(100, Math.round((order.paidCents / order.totalCents) * 100)) : 0
  const change = async (status: OrderStatus, message: string) => {
    setBusy(true)
    const error = await submit(setOrderStatus(id, status), message)
    setBusy(false)
    if (error) notify(error, true)
    return !error
  }
  const inFactory = order.status === 'in_production' && order.batch && order.batch.status !== 'received'
  // Entregar o reservar una venta que está en fábrica la saca del pedido; lo encargado queda como reposición.
  const fromStock = (status: 'ready' | 'delivered', message: string) => inFactory
    ? open({ type: 'confirm', title: status === 'delivered' ? `¿Entregar ${order.code} desde stock?` : `¿Reservar ${order.code} desde stock?`, confirmLabel: status === 'delivered' ? 'Entregar ahora' : 'Reservar', body: <>La venta sale de <strong>{order.batch!.name}</strong>. Lo que ya encargaste para ella sigue en ese pedido como <strong>reposición de stock</strong> y entra libre cuando lo recibas.</>, run: () => change(status, message) })
    : change(status, message)
  const whatsapp = whatsappUrl(order.customerPhone, `Hola ${order.customerName}, te escribo por tu compra ${order.code}.`)
  const hasStock = view.canFulfill(order)
  const waiting = order.status === 'pending' || order.status === 'in_production'
  const manual = !order.items.length
  const details: [string, string | null][] = [['Para', order.recipient || null], ['Bloque', order.block], ['Profesor/a', order.professor], ['Sede', order.venue], ['Entrega', order.deliveryDate ? formatDate(order.deliveryDate) : null], ['Pedido a fábrica', order.batch?.name ?? null], ['Cargada', formatDate(order.createdAt)]]

  return (
    <Modal open onClose={close} size="lg" title={`Venta ${order.code}`}
      description={<span className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-700">{order.customerName}</span><OrderBadge status={order.status} /><PaymentBadge status={order.paymentStatus} /></span>}
      footer={<>
        <div className="mr-auto">
          <ActionMenu align="start" trigger={<Button variant="ghost" aria-label="Más acciones" className="px-3"><MoreHorizontal className="size-5 sm:hidden" /><span className="hidden sm:inline">Más acciones</span></Button>} actions={[
            { label: order.status === 'pending' && !manual ? 'Editar productos y datos' : 'Editar datos', icon: Pencil, onSelect: () => open({ type: 'orderEdit', id }) },
            { label: 'Encargar a fábrica', icon: Factory, hidden: order.status !== 'pending' || manual || !hasStock, onSelect: () => open({ type: 'batch', orderIds: [id] }) },
            { label: 'Liberar reserva (volver a pendiente)', icon: Undo2, hidden: order.status !== 'ready', onSelect: () => change('pending', 'Reserva liberada: la venta quedó pendiente') },
            { label: 'Deshacer entrega', icon: Undo2, hidden: order.status !== 'delivered', onSelect: () => change('ready', 'Entrega deshecha: las unidades volvieron al stock reservadas') },
            { label: 'Retomar venta', icon: RotateCcw, hidden: !cancelled, onSelect: () => change('pending', 'Venta retomada como pendiente') },
            { label: 'Cancelar venta', icon: Ban, danger: true, hidden: cancelled, onSelect: () => open({ type: 'confirm', title: `¿Cancelar ${order.code}?`, confirmLabel: 'Cancelar venta', danger: true, body: <>Deja de contar en ventas{order.status === 'ready' ? ' y se libera la reserva' : ''}{order.status === 'delivered' ? ' y las unidades vuelven al stock' : ''}{inFactory ? '. Lo encargado a fábrica queda como reposición' : ''}.{order.paidCents > 0 && <> Los <strong>{money(order.paidCents)}</strong> cobrados quedan registrados: si los devolvés, anulá esos pagos.</>}</>, run: () => change('cancelled', 'Venta cancelada') }) },
          ]} />
        </div>
        {!cancelled && order.balanceCents > 0 && <Button variant="secondary" className="px-3 sm:px-4" onClick={() => open({ type: 'payment', orderId: id })}><WalletCards className="hidden size-4 sm:block" /> Registrar pago</Button>}
        {order.status === 'pending' && !manual && !hasStock && <Button onClick={() => open({ type: 'batch', orderIds: [id] })}><Factory className="size-4" /> Encargar a fábrica</Button>}
        {waiting && (hasStock || manual) && <Button variant="secondary" disabled={busy} onClick={() => fromStock('ready', manual ? 'Venta lista para entregar' : 'Stock reservado: lista para entregar')}>{manual ? 'Marcar lista' : 'Reservar'}</Button>}
        {waiting && (hasStock || manual) && <Button variant="success" disabled={busy} onClick={() => fromStock('delivered', 'Venta entregada')}><Check className="size-4" /> Entregar ahora</Button>}
        {order.status === 'ready' && <Button variant="success" disabled={busy} className="flex-1 sm:flex-none" onClick={() => change('delivered', 'Venta entregada')}><PackageCheck className="size-4" /> Marcar entregada</Button>}
      </>}>
      <div className="space-y-6">
        {!cancelled && (
          <ol className="grid grid-cols-4 gap-1.5" aria-label="Avance de la venta">
            {STEPS.map((item, index) => (
              <li key={item.status} aria-current={index === step ? 'step' : undefined}>
                <div className={cn('h-1.5 rounded-full', index <= step ? 'bg-slate-950' : 'bg-slate-200', item.status === 'in_production' && step !== 1 && 'opacity-40')} />
                <p className={cn('mt-2 text-[11px] leading-tight sm:text-xs', index === step ? 'font-bold text-slate-950' : index < step ? 'font-medium text-slate-600' : 'text-slate-400')}>{item.status === 'in_production' && step !== 1 ? 'Fábrica (si hace falta)' : item.label}</p>
              </li>
            ))}
          </ol>
        )}
        {waiting && !manual && (hasStock
          ? <p className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900">Hay stock para toda la venta: podés <strong>entregarla ahora</strong> o reservarla{inFactory ? '. No hace falta esperar a la fábrica' : ''}.</p>
          : order.status === 'pending'
            ? <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">No alcanza el stock. Encargala a fábrica, o esperá a que entre mercadería: cuando haya stock vas a poder entregarla desde acá.</p>
            : <p className="rounded-xl bg-sky-50 px-3.5 py-3 text-sm text-sky-900">Encargada en <strong>{order.batch?.name}</strong>. Al recibir ese pedido, la venta queda reservada y lista para entregar.</p>)}
        {order.status === 'ready' && <p className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900">Las unidades están reservadas para esta venta. Al entregarla se descuentan del stock.</p>}
        {cancelled && <p className="rounded-xl bg-slate-100 px-3.5 py-3 text-sm text-slate-600">Esta venta está cancelada.</p>}

        <div className="grid gap-6 md:grid-cols-[1.35fr_1fr]">
          <div className="space-y-6">
            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Productos</h3>
              {order.items.length ? (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {order.items.map((item) => {
                    const free = waiting ? Math.max(0, view.availableFor(item.productId, item.size, order.id)) : null
                    return (
                      <li key={item.id} className="flex items-center gap-3 px-3.5 py-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold tabular-nums text-slate-700">{item.quantity}×</span>
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{[item.size && `Talle ${item.size}`, item.color, `${money(item.unitPriceCents)} c/u`].filter(Boolean).join(' · ')}{free !== null && <span className={cn('ml-1 font-semibold', free >= item.quantity ? 'text-emerald-700' : 'text-amber-700')}>· {free} en stock</span>}</p></div>
                        <p className="text-sm font-semibold tabular-nums text-slate-900">{money(item.unitPriceCents * item.quantity)}</p>
                      </li>
                    )
                  })}
                </ul>
              ) : <p className="rounded-xl border border-dashed border-slate-300 px-3.5 py-3 text-sm text-slate-500">Venta cargada sin productos del catálogo{order.size ? ` · talle ${order.size}` : ''}.</p>}
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Pagos</h3>
              {payments.length ? (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {payments.map((payment) => (
                    <li key={payment.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold tabular-nums text-slate-900">{money(payment.amountCents)}</p><p className="truncate text-xs text-slate-500">{formatDate(payment.paidAt)} · {payment.method}{payment.notes ? ` · ${payment.notes}` : ''}</p></div>
                      <button onClick={() => open({ type: 'confirm', title: '¿Anular este pago?', confirmLabel: 'Anular pago', danger: true, body: <>Se quita el pago de <strong>{money(payment.amountCents)}</strong> y el saldo vuelve a la venta. Si había entrado en una cuenta de caja, también se descuenta de ahí.</>, run: async () => { const error = await submit(voidPayment(payment.id), 'Pago anulado'); if (error) notify(error, true); return !error } })} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 outline-none hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-slate-950">Anular</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="rounded-xl border border-dashed border-slate-300 px-3.5 py-3 text-sm text-slate-500">Todavía no hay pagos registrados.</p>}
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-baseline justify-between"><span className="text-sm text-slate-600">Total</span><span className="text-xl font-bold tabular-nums text-slate-950">{money(order.totalCents)}</span></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${paidPct}%` }} /></div>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-slate-600">Pagado</dt><dd className="font-semibold tabular-nums text-emerald-700">{money(order.paidCents)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-600">Saldo</dt><dd className={cn('font-semibold tabular-nums', order.balanceCents > 0 ? 'text-amber-700' : 'text-slate-900')}>{money(order.balanceCents)}</dd></div>
                {order.costCents > 0 && <div className="flex justify-between border-t border-slate-200 pt-1.5"><dt className="text-slate-600">Ganancia estimada</dt><dd className="font-semibold tabular-nums text-slate-900">{money(order.totalCents - order.costCents)}</dd></div>}
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Datos</h3>
              <dl className="space-y-2 text-sm">
                {details.filter(([, value]) => value).map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 truncate text-right font-medium text-slate-900">{label === 'Pedido a fábrica' && order.batch ? <button onClick={() => open({ type: 'batchDetail', id: order.batch!.id })} className="underline underline-offset-2">{value}</button> : value}</dd></div>)}
              </dl>
              {order.notes && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">{order.notes}</p>}
              {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 underline-offset-4 hover:underline"><MessageCircle className="size-4" /> Escribirle por WhatsApp</a>}
            </section>
          </div>
        </div>
      </div>
    </Modal>
  )
}
