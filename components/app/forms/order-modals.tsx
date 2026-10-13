'use client'

import { Ban, Check, CircleDollarSign, Factory, MessageCircle, MoreHorizontal, Pencil, Ruler, Plus, RotateCcw, ShoppingBag, Trash2, Undo2, WalletCards } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createOrder, recordPayment, setOrderStatus, updateOrder, voidPayment } from '@/app/actions/orders'
import { useApp } from '@/components/app/store'
import { OrderBadge, PaymentBadge } from '@/components/app/parts'
import { ActionMenu, Button, Field, FormSection, Input, MoneyInput, Select, Textarea } from '@/components/ui/controls'
import { FormModal, Modal } from '@/components/ui/modal'
import { ORDER_FLOW, ORDER_STATUS, PAYMENT_METHODS, formatDate, hasChart, money, toCents, todayISO, type OrderStatus } from '@/lib/domain'
import { cn } from '@/lib/utils'

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
type Line = { key: number; productId: string; size: string; quantity: string; price: string }

export function OrderForm() {
  const { view, close, submit, open } = useApp()
  const products = view.products.filter((product) => product.active)
  const accounts = view.accounts.filter((account) => account.active)
  const [newCustomer, setNewCustomer] = useState(view.customers.length === 0)
  const [lines, setLines] = useState<Line[]>(products.length ? [{ key: 1, productId: '', size: '', quantity: '1', price: '' }] : [])
  const [manualTotal, setManualTotal] = useState('')
  const [deposit, setDeposit] = useState('')

  const patch = (key: number, change: Partial<Line>) => setLines((list) => list.map((line) => line.key === key ? { ...line, ...change } : line))
  const filled = lines.filter((line) => line.productId)
  const totalCents = filled.length ? filled.reduce((sum, line) => sum + (toCents(line.price) || 0) * (Number(line.quantity) || 0), 0) : toCents(manualTotal) || 0
  const depositCents = toCents(deposit) || 0

  return (
    <FormModal
      open onClose={close} size="lg" icon={ShoppingBag} title="Nuevo pedido" description="El código se asigna solo al guardar." submitLabel="Guardar pedido"
      summary={<span className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 tabular-nums"><span>Total <strong className="text-base text-slate-950">{money(totalCents)}</strong></span>{depositCents > 0 && <span className="text-slate-500">Saldo {money(Math.max(0, totalCents - depositCents))}</span>}</span>}
      onSubmit={(form) => submit(createOrder({
        customerId: newCustomer ? undefined : text(form, 'customerId') || undefined,
        newCustomer: newCustomer ? { name: text(form, 'customerName'), phone: text(form, 'customerPhone') } : undefined,
        firstName: text(form, 'firstName'), lastName: text(form, 'lastName'), block: text(form, 'block'), professor: text(form, 'professor'), venue: text(form, 'venue'),
        deliveryDate: text(form, 'deliveryDate'), notes: text(form, 'notes'),
        items: filled.map((line) => ({ productId: line.productId, size: line.size, quantity: Number(line.quantity), unitPriceCents: toCents(line.price) })),
        manualTotalCents: filled.length ? undefined : toCents(manualTotal),
        depositCents, method: text(form, 'method'), accountId: text(form, 'accountId') || undefined,
      }), 'Pedido guardado').then((error) => { if (!error) close(); return error })}
    >
      <div className="space-y-5">
        <FormSection title="Cliente">
          {newCustomer ? <>
            <Field label="Nombre y apellido"><Input name="customerName" required autoFocus placeholder="Quien hace el pedido" /></Field>
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
              <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600">Todavía no cargaste productos en el catálogo. Podés guardar el pedido con un total a mano, o <button type="button" onClick={() => { close(); open({ type: 'product' }) }} className="font-semibold text-slate-950 underline underline-offset-4">crear un producto primero</button>.</p>
              <Field label="Total del pedido" className="sm:max-w-xs"><MoneyInput value={manualTotal} onChange={(event) => setManualTotal(event.target.value)} required /></Field>
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((line, index) => {
                const product = view.productById.get(line.productId)
                return (
                  <div key={line.key} className="grid grid-cols-[1fr_1fr] gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_5rem_minmax(0,1.1fr)_2.5rem] sm:items-end sm:border-0 sm:bg-transparent sm:p-0">
                    <Field label={index === 0 ? 'Producto' : 'Producto'} className={cn('col-span-2 sm:col-span-1', index > 0 && 'sm:[&>span]:sr-only')}>
                      <Select value={line.productId} required={index === 0} onChange={(event) => { const next = view.productById.get(event.target.value); patch(line.key, { productId: event.target.value, size: '', price: next ? String(next.priceCents / 100).replace('.', ',') : '' }) }}>
                        <option value="">Elegí…</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}{item.color ? ` · ${item.color}` : ''}</option>)}
                      </Select>
                    </Field>
                    <Field label="Talle" className={cn(index > 0 && 'sm:[&>span]:sr-only')}>
                      {product?.sizes.length ? <Select value={line.size} onChange={(event) => patch(line.key, { size: event.target.value })}><option value="">—</option>{product.sizes.map((size) => <option key={size}>{size}</option>)}</Select> : <Input value={line.size} onChange={(event) => patch(line.key, { size: event.target.value })} placeholder="—" />}
                    </Field>
                    <Field label="Cant." className={cn(index > 0 && 'sm:[&>span]:sr-only')}><Input type="number" inputMode="numeric" min={1} value={line.quantity} onChange={(event) => patch(line.key, { quantity: event.target.value })} className="tabular-nums" /></Field>
                    <Field label="Precio c/u" className={cn('col-span-1', index > 0 && 'sm:[&>span]:sr-only')}><MoneyInput value={line.price} onChange={(event) => patch(line.key, { price: event.target.value })} /></Field>
                    <button type="button" aria-label="Quitar producto" disabled={lines.length === 1} onClick={() => setLines((list) => list.filter((item) => item.key !== line.key))} className="flex h-11 items-center justify-center self-end rounded-lg text-slate-400 outline-none transition hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-slate-950 disabled:invisible sm:h-10"><Trash2 className="size-4" /></button>
                    {product && hasChart(product.sizeChart) && <button type="button" onClick={() => open({ type: 'sizeChart', id: product.id })} className="col-span-full -mt-1 inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-slate-700 underline underline-offset-2 outline-none hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-950"><Ruler className="size-3.5" /> Ver tabla de medidas</button>}
                  </div>
                )
              })}
              <Button variant="secondary" size="sm" onClick={() => setLines((list) => [...list, { key: Math.max(0, ...list.map((line) => line.key)) + 1, productId: '', size: '', quantity: '1', price: '' }])}><Plus className="size-3.5" /> Agregar otro producto</Button>
            </div>
          )}
        </section>

        <FormSection title="Seña">
          <Field label="Seña recibida" optional><MoneyInput name="deposit" value={deposit} onChange={(event) => setDeposit(event.target.value)} /></Field>
          <Field label="Medio de pago"><Select name="method" defaultValue="Efectivo">{PAYMENT_METHODS.map((item) => <option key={item}>{item}</option>)}</Select></Field>
          {accounts.length > 0 && <Field label="Entra en la cuenta" optional className="sm:col-span-2"><Select name="accountId" defaultValue=""><option value="">No registrar en caja</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></Field>}
        </FormSection>

        <FormSection title="Para quién es">
          <Field label="Nombre" optional hint="Si lo dejás vacío se usa el nombre del cliente."><Input name="firstName" placeholder="Alumno/a" /></Field>
          <Field label="Apellido" optional><Input name="lastName" /></Field>
          <Field label="Bloque" optional><Input name="block" placeholder="Bloque o curso" /></Field>
          <Field label="Profesor/a" optional><Input name="professor" /></Field>
          <Field label="Sede" optional><Input name="venue" /></Field>
          <Field label="Fecha de entrega" optional><Input name="deliveryDate" type="date" min={todayISO()} /></Field>
          <Field label="Notas" optional className="sm:col-span-2"><Textarea name="notes" placeholder="Aclaraciones del pedido" /></Field>
        </FormSection>
      </div>
    </FormModal>
  )
}

export function OrderEditForm({ id }: { id: string }) {
  const { view, close, submit } = useApp()
  const order = view.orderById.get(id)
  if (!order) return null
  return (
    <FormModal open onClose={close} icon={Pencil} title={`Editar ${order.code}`} description="Los productos y el total no se modifican desde acá." submitLabel="Guardar cambios"
      onSubmit={(form) => submit(updateOrder({ id, firstName: text(form, 'firstName'), lastName: text(form, 'lastName'), block: text(form, 'block'), professor: text(form, 'professor'), venue: text(form, 'venue'), deliveryDate: text(form, 'deliveryDate'), notes: text(form, 'notes') }), 'Pedido actualizado').then((error) => { if (!error) close(); return error })}>
      <FormSection>
        <Field label="Nombre"><Input name="firstName" required defaultValue={order.firstName ?? ''} /></Field>
        <Field label="Apellido" optional><Input name="lastName" defaultValue={order.lastName ?? ''} /></Field>
        <Field label="Bloque" optional><Input name="block" defaultValue={order.block ?? ''} /></Field>
        <Field label="Profesor/a" optional><Input name="professor" defaultValue={order.professor ?? ''} /></Field>
        <Field label="Sede" optional><Input name="venue" defaultValue={order.venue ?? ''} /></Field>
        <Field label="Fecha de entrega" optional><Input name="deliveryDate" type="date" defaultValue={order.deliveryDate ?? ''} /></Field>
        <Field label="Notas" optional className="sm:col-span-2"><Textarea name="notes" defaultValue={order.notes ?? ''} /></Field>
      </FormSection>
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

export function OrderDetail({ id }: { id: string }) {
  const { view, close, open, submit, notify } = useApp()
  const order = view.orderById.get(id)
  const payments = useMemo(() => view.payments.filter((payment) => payment.orderId === id), [view.payments, id])
  const [busy, setBusy] = useState(false)
  if (!order) return null

  const cancelled = order.status === 'cancelled'
  const step = ORDER_FLOW.indexOf(order.status as OrderStatus)
  const paidPct = order.totalCents > 0 ? Math.min(100, Math.round((order.paidCents / order.totalCents) * 100)) : 0
  const change = async (status: OrderStatus, message: string) => {
    setBusy(true)
    const error = await submit(setOrderStatus(id, status), message)
    setBusy(false)
    if (error) notify(error, true)
  }
  const whatsapp = order.customerPhone ? `https://wa.me/${order.customerPhone.replace(/\D/g, '').replace(/^(?!54)/, '54')}` : null
  const next = ORDER_FLOW[step + 1]
  const details: [string, string | null][] = [['Para', order.recipient || null], ['Bloque', order.block], ['Profesor/a', order.professor], ['Sede', order.venue], ['Entrega', order.deliveryDate ? formatDate(order.deliveryDate) : null], ['Tanda', order.batch?.name ?? null], ['Cargado', formatDate(order.createdAt)]]

  return (
    <Modal open onClose={close} size="lg" title={`Pedido ${order.code}`}
      description={<span className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-700">{order.customerName}</span><OrderBadge status={order.status} /><PaymentBadge status={order.paymentStatus} /></span>}
      footer={<>
        <div className="mr-auto">
          <ActionMenu align="start" trigger={<Button variant="ghost" aria-label="Más acciones" className="px-3"><MoreHorizontal className="size-5 sm:hidden" /><span className="hidden sm:inline">Más acciones</span></Button>} actions={[
            { label: 'Editar datos', icon: Pencil, onSelect: () => open({ type: 'orderEdit', id }) },
            { label: 'Volver un paso atrás', icon: Undo2, hidden: cancelled || step <= 0, onSelect: () => change(ORDER_FLOW[step - 1], `Volvió a "${ORDER_STATUS[ORDER_FLOW[step - 1]]}"`) },
            { label: 'Retomar pedido', icon: RotateCcw, hidden: !cancelled, onSelect: () => change('pending', 'Pedido retomado') },
            { label: 'Cancelar pedido', icon: Ban, danger: true, hidden: cancelled, onSelect: () => open({ type: 'confirm', title: `¿Cancelar ${order.code}?`, confirmLabel: 'Cancelar pedido', danger: true, body: <>El pedido deja de contar en ventas y en lo solicitado a fábrica.{order.paidCents > 0 && <> Los <strong>{money(order.paidCents)}</strong> ya cobrados quedan registrados: si los devolvés, anulá esos pagos.</>}</>, run: async () => { const error = await submit(setOrderStatus(id, 'cancelled'), 'Pedido cancelado'); if (error) notify(error, true); return !error } }) },
          ]} />
        </div>
        {!cancelled && order.balanceCents > 0 && <Button variant={next ? 'secondary' : 'primary'} className="px-3 sm:px-4" onClick={() => open({ type: 'payment', orderId: id })}><WalletCards className="hidden size-4 sm:block" /> Registrar pago</Button>}
        {!cancelled && next && <Button disabled={busy} className="flex-1 px-3 sm:flex-none sm:px-4" onClick={() => change(next, `Pedido ${ORDER_STATUS[next].toLowerCase()}`)}>{next === 'in_production' ? <Factory className="size-4" /> : <Check className="size-4" />}{next === 'in_production' ? 'Pasar a fábrica' : next === 'ready' ? 'Marcar listo' : 'Marcar entregado'}</Button>}
      </>}>
      <div className="space-y-6">
        {!cancelled && (
          <ol className="grid grid-cols-4 gap-1.5" aria-label="Avance del pedido">
            {ORDER_FLOW.map((status, index) => (
              <li key={status} aria-current={index === step ? 'step' : undefined}>
                <div className={cn('h-1.5 rounded-full', index <= step ? 'bg-slate-950' : 'bg-slate-200')} />
                <p className={cn('mt-2 text-[11px] leading-tight sm:text-xs', index === step ? 'font-bold text-slate-950' : index < step ? 'font-medium text-slate-600' : 'text-slate-400')}>{ORDER_STATUS[status]}</p>
              </li>
            ))}
          </ol>
        )}
        {cancelled && <p className="rounded-xl bg-slate-100 px-3.5 py-3 text-sm text-slate-600">Este pedido está cancelado.</p>}

        <div className="grid gap-6 md:grid-cols-[1.35fr_1fr]">
          <div className="space-y-6">
            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Productos</h3>
              {order.items.length ? (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 px-3.5 py-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold tabular-nums text-slate-700">{item.quantity}×</span>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{[item.size && `Talle ${item.size}`, item.color, `${money(item.unitPriceCents)} c/u`].filter(Boolean).join(' · ')}</p></div>
                      <p className="text-sm font-semibold tabular-nums text-slate-900">{money(item.unitPriceCents * item.quantity)}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="rounded-xl border border-dashed border-slate-300 px-3.5 py-3 text-sm text-slate-500">Pedido cargado sin productos del catálogo{order.size ? ` · talle ${order.size}` : ''}.</p>}
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Pagos</h3>
              {payments.length ? (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {payments.map((payment) => (
                    <li key={payment.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold tabular-nums text-slate-900">{money(payment.amountCents)}</p><p className="truncate text-xs text-slate-500">{formatDate(payment.paidAt)} · {payment.method}{payment.notes ? ` · ${payment.notes}` : ''}</p></div>
                      <button onClick={() => open({ type: 'confirm', title: '¿Anular este pago?', confirmLabel: 'Anular pago', danger: true, body: <>Se quita el pago de <strong>{money(payment.amountCents)}</strong> y el saldo vuelve al pedido. Si había entrado en una cuenta de caja, también se descuenta de ahí.</>, run: async () => { const error = await submit(voidPayment(payment.id), 'Pago anulado'); if (error) notify(error, true); return !error } })} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 outline-none hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-slate-950">Anular</button>
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
                {details.filter(([, value]) => value).map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 truncate text-right font-medium text-slate-900">{value}</dd></div>)}
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
