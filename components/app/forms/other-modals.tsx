'use client'

import { ArrowLeftRight, Boxes, Check, ClipboardCopy, Factory, Landmark, PackageCheck, Pencil, Plus, Receipt, Ruler, Shirt, Truck, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { saveCustomer } from '@/app/actions/customers'
import { createCashMovement, createExpense, saveCashAccount } from '@/app/actions/finance'
import { saveSupplier } from '@/app/actions/production'
import { saveProduct } from '@/app/actions/products'
import { BatchBadge } from '@/components/app/parts'
import { useApp } from '@/components/app/store'
import { Button, Field, FormSection, Input, MoneyInput, Select, Textarea } from '@/components/ui/controls'
import { FormModal, Modal } from '@/components/ui/modal'
import { EXPENSE_CATEGORIES, STANDARD_SIZES, formatDate, hasChart, money, sortSizes, toCents, todayISO, type SizeChart } from '@/lib/domain'
import type { OrderView } from '@/lib/view'
import { WhatsAppLink } from '@/components/app/whatsapp-link'
import { cn } from '@/lib/utils'

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const list = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean)
const pesos = (cents: number) => cents ? String(cents / 100).replace('.', ',') : ''

export function CustomerForm({ id }: { id?: string }) {
  const { view, close, submit } = useApp()
  const customer = id ? view.customerById.get(id) : undefined
  return (
    <FormModal open onClose={close} icon={UserRound} title={customer ? 'Editar cliente' : 'Nuevo cliente'} submitLabel={customer ? 'Guardar cambios' : 'Guardar cliente'}
      onSubmit={(form) => submit(saveCustomer({ id, name: text(form, 'name'), phone: text(form, 'phone'), email: text(form, 'email'), notes: text(form, 'notes') }), customer ? 'Cliente actualizado' : 'Cliente guardado').then((error) => { if (!error) close(); return error })}>
      <FormSection>
        <Field label="Nombre y apellido" className="sm:col-span-2"><Input name="name" required autoFocus defaultValue={customer?.name} /></Field>
        <Field label="Teléfono" optional><Input name="phone" type="tel" inputMode="tel" defaultValue={customer?.phone ?? ''} placeholder="11 5555 5555" /></Field>
        <Field label="Email" optional><Input name="email" type="email" inputMode="email" defaultValue={customer?.email ?? ''} /></Field>
        <Field label="Notas" optional className="sm:col-span-2"><Textarea name="notes" defaultValue={customer?.notes ?? ''} /></Field>
      </FormSection>
    </FormModal>
  )
}

const CHART_COLUMNS = ['Ancho', 'Largo', 'Manga']

export function ProductForm({ id }: { id?: string }) {
  const { view, close, submit } = useApp()
  const product = id ? view.productById.get(id) : undefined
  const [sizes, setSizes] = useState<string[]>(product?.sizes ?? [])
  const [custom, setCustom] = useState('')
  const [chart, setChart] = useState<SizeChart>(product?.sizeChart ?? { columns: [], rows: {} })
  const [cost, setCost] = useState(pesos(product?.costCents ?? 0))
  const [price, setPrice] = useState(pesos(product?.priceCents ?? 0))
  const [initialStock, setInitialStock] = useState<Record<string, string>>({})
  const costCents = toCents(cost) || 0
  const priceCents = toCents(price) || 0
  const categories = [...new Set(view.products.map((item) => item.category))]
  // Los estándar siempre a la vista para tildar; los propios (35-38, Único…) aparecen al lado.
  const options = [...STANDARD_SIZES, ...sizes.filter((size) => !(STANDARD_SIZES as readonly string[]).includes(size))]
  const ordered = sortSizes(sizes)

  const toggle = (size: string) => setSizes((list) => list.includes(size) ? list.filter((item) => item !== size) : [...list, size])
  const addCustom = () => { const size = custom.trim().slice(0, 12); if (size && !sizes.includes(size)) setSizes((list) => [...list, size]); setCustom('') }
  const setCell = (size: string, column: number, value: string) => setChart((current) => ({ ...current, rows: { ...current.rows, [size]: Object.assign(Array.from({ length: current.columns.length }, (_, index) => current.rows[size]?.[index] ?? ''), { [column]: value }) } }))
  const renameColumn = (column: number, value: string) => setChart((current) => ({ ...current, columns: current.columns.map((name, index) => index === column ? value : name) }))
  const removeColumn = (column: number) => setChart((current) => ({ columns: current.columns.filter((_, index) => index !== column), rows: Object.fromEntries(Object.entries(current.rows).map(([size, row]) => [size, row.filter((_, index) => index !== column)])) }))
  const addColumn = () => setChart((current) => ({ ...current, columns: [...current.columns, CHART_COLUMNS.find((name) => !current.columns.includes(name)) ?? ''] }))

  return (
    <FormModal open onClose={close} size="lg" icon={Shirt} title={product ? 'Editar producto' : 'Nuevo producto'} submitLabel={product ? 'Guardar cambios' : 'Guardar producto'}
      summary={priceCents > 0 ? <>Ganás <strong className="text-slate-950">{money(priceCents - costCents)}</strong> por unidad ({Math.round(((priceCents - costCents) / priceCents) * 100)}%)</> : undefined}
      onSubmit={(form) => submit(saveProduct({ id, name: text(form, 'name'), category: text(form, 'category'), color: text(form, 'color'), costCents, priceCents, sizes, sizeChart: chart.columns.length ? chart : null, initialStock: product ? undefined : Object.fromEntries((ordered.length ? ordered : ['']).map((size) => [size, Number(initialStock[size] || 0)])) }), product ? 'Producto actualizado' : 'Producto guardado').then((error) => { if (!error) close(); return error })}>
      <div className="space-y-5">
        <FormSection>
          <Field label="Nombre" className="sm:col-span-2"><Input name="name" required autoFocus defaultValue={product?.name} placeholder="Campera" /></Field>
          <Field label="Categoría" optional><Input name="category" list="categorias" defaultValue={product?.category} placeholder="Abrigos" /><datalist id="categorias">{categories.map((category) => <option key={category} value={category} />)}</datalist></Field>
          <Field label="Color" optional><Input name="color" defaultValue={product?.color ?? ''} placeholder="Negro" /></Field>
        </FormSection>

        <FormSection title="Precios">
          <Field label="Costo" hint="Lo que te cobra la fábrica por unidad."><MoneyInput value={cost} onChange={(event) => setCost(event.target.value)} /></Field>
          <Field label="Precio de venta"><MoneyInput value={price} onChange={(event) => setPrice(event.target.value)} required /></Field>
        </FormSection>

        <section className="border-t border-slate-200 pt-5">
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Talles</h3>
          <p className="mb-3 text-sm text-slate-500">Tildá los talles en los que viene. Son los que vas a poder elegir al tomar un pedido.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Talles disponibles">
            {options.map((size) => {
              const checked = sizes.includes(size)
              return (
                <label key={size} className={cn('flex h-11 min-w-14 cursor-pointer select-none items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-slate-950 has-[:focus-visible]:ring-offset-2 sm:h-10', checked ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(size)} className="sr-only" />
                  <span aria-hidden className={cn('flex size-4 items-center justify-center rounded border', checked ? 'border-white bg-white text-slate-950' : 'border-slate-400')}>{checked && <Check className="size-3" strokeWidth={3.5} />}</span>
                  {size}
                </label>
              )
            })}
          </div>
          <div className="mt-3 flex max-w-xs gap-2">
            <Input value={custom} onChange={(event) => setCustom(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustom() } }} placeholder="Otro talle: Único, 35-38…" aria-label="Agregar otro talle" />
            <Button variant="secondary" onClick={addCustom} disabled={!custom.trim()}>Agregar</Button>
          </div>
        </section>

        {!product && (
          <section className="border-t border-slate-200 pt-5">
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Stock que ya tenés</h3>
            <p className="mb-3 text-sm text-slate-500">{ordered.length ? 'Unidades en mano de cada talle. Dejá vacío lo que no tenés.' : 'Unidades en mano. Si viene en talles, tildalos arriba primero.'}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {(ordered.length ? ordered : ['']).map((size) => <Field key={size || 'unico'} label={size || 'Unidades'}><Input type="number" inputMode="numeric" min={0} max={100000} value={initialStock[size] ?? ''} onChange={(event) => setInitialStock((current) => ({ ...current, [size]: event.target.value }))} placeholder="0" className="text-center tabular-nums" /></Field>)}
            </div>
          </section>
        )}

        <section className="border-t border-slate-200 pt-5">
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Tabla de medidas</h3>
          {!ordered.length ? <p className="text-sm text-slate-500">Tildá al menos un talle para cargar sus medidas.</p> : !chart.columns.length ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-slate-500">Cargá las medidas de cada talle (en centímetros) para consultarlas al tomar un pedido.</p>
              <Button variant="secondary" onClick={() => setChart((current) => ({ ...current, columns: [...CHART_COLUMNS] }))}><Ruler className="size-4" /> Cargar tabla de medidas</Button>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-500">En centímetros. Podés cambiar el nombre de cada medida.</p>
              <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
                <table className="w-full border-separate border-spacing-x-1.5 border-spacing-y-1.5">
                  <thead>
                    <tr>
                      <th scope="col" className="w-12 text-left text-[13px] font-semibold text-slate-700">Talle</th>
                      {chart.columns.map((column, index) => (
                        <th key={index} scope="col" className="min-w-[5.25rem] font-normal">
                          <div className="relative"><Input value={column} onChange={(event) => renameColumn(index, event.target.value)} placeholder="Medida" aria-label={`Nombre de la medida ${index + 1}`} className="pr-8 font-semibold" /><button type="button" onClick={() => removeColumn(index)} aria-label={`Quitar la medida ${column || index + 1}`} className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 outline-none hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-slate-950"><X className="size-3.5" /></button></div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ordered.map((size) => (
                      <tr key={size}>
                        <th scope="row" className="text-left"><span className="inline-flex h-8 min-w-10 items-center justify-center rounded-lg bg-slate-100 px-2 text-sm font-bold text-slate-800">{size}</span></th>
                        {chart.columns.map((column, index) => <td key={index}><Input value={chart.rows[size]?.[index] ?? ''} onChange={(event) => setCell(size, index, event.target.value)} inputMode="decimal" placeholder="—" aria-label={`${column || 'Medida'} del talle ${size}`} className="text-center tabular-nums" /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {chart.columns.length < 8 && <Button size="sm" variant="secondary" onClick={addColumn}><Plus className="size-3.5" /> Agregar medida</Button>}
                <Button size="sm" variant="ghost" onClick={() => setChart({ columns: [], rows: {} })}>Quitar la tabla</Button>
              </div>
            </>
          )}
        </section>
      </div>
    </FormModal>
  )
}

/** Tabla de medidas de un producto, para consultar. */
export function SizeChartModal({ id }: { id: string }) {
  const { view, close, open } = useApp()
  const product = view.productById.get(id)
  if (!product) return null
  const chart = product.sizeChart
  return (
    <Modal open onClose={close} icon={Ruler} title="Tabla de medidas" description={`${product.name}${product.color ? ` · ${product.color}` : ''} · en centímetros`}
      footer={<><Button variant="ghost" onClick={() => { close(); open({ type: 'product', id }) }}><Pencil className="size-4" /> Editar medidas</Button><Button onClick={close}>Listo</Button></>}>
      {hasChart(chart) ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th scope="col" className="px-4 py-2.5 text-left">Talle</th>{chart.columns.map((column) => <th key={column} scope="col" className="px-4 py-2.5 text-right">{column}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {sortSizes(product.sizes).map((size) => <tr key={size}><th scope="row" className="px-4 py-3 text-left font-bold text-slate-950">{size}</th>{chart.columns.map((column, index) => <td key={column} className="px-4 py-3 text-right tabular-nums text-slate-700">{chart.rows[size]?.[index] || '—'}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-slate-500">Este producto todavía no tiene medidas cargadas.</p>}
    </Modal>
  )
}

export function SupplierForm({ id }: { id?: string }) {
  const { view, close, submit } = useApp()
  const supplier = id ? view.supplierById.get(id) : undefined
  return (
    <FormModal open onClose={close} icon={Factory} title={supplier ? 'Editar proveedor' : 'Nuevo proveedor'} submitLabel={supplier ? 'Guardar cambios' : 'Guardar proveedor'}
      onSubmit={(form) => submit(saveSupplier({ id, name: text(form, 'name'), contact: text(form, 'contact'), categories: list(text(form, 'categories')) }), supplier ? 'Proveedor actualizado' : 'Proveedor guardado').then((error) => { if (!error) close(); return error })}>
      <FormSection>
        <Field label="Nombre de la fábrica" className="sm:col-span-2"><Input name="name" required autoFocus defaultValue={supplier?.name} /></Field>
        <Field label="Contacto" optional hint="Para WhatsApp: teléfono argentino con área, o +código de país para otros países."><Input name="contact" type="tel" defaultValue={supplier?.contact ?? ''} placeholder="WhatsApp o teléfono" /></Field>
        <Field label="Qué fabrica" optional hint="Separado por coma."><Input name="categories" defaultValue={supplier?.categories.join(', ')} placeholder="Medias, calzas" /></Field>
      </FormSection>
    </FormModal>
  )
}

export function AccountForm({ id }: { id?: string }) {
  const { view, close, submit } = useApp()
  const account = id ? view.accountById.get(id) : undefined
  return (
    <FormModal open onClose={close} size="sm" icon={Landmark} title={account ? 'Editar cuenta' : 'Nueva cuenta'} description="Un lugar donde guardás plata: efectivo, banco, Mercado Pago." submitLabel={account ? 'Guardar cambios' : 'Crear cuenta'}
      onSubmit={(form) => submit(saveCashAccount({ id, name: text(form, 'name'), openingBalanceCents: toCents(form.get('opening')) }), account ? 'Cuenta actualizada' : 'Cuenta creada').then((error) => { if (!error) close(); return error })}>
      <div className="space-y-4">
        <Field label="Nombre"><Input name="name" required autoFocus defaultValue={account?.name} placeholder="Efectivo" /></Field>
        <Field label="Saldo inicial" hint="Lo que había en la cuenta antes de empezar a usar el sistema."><MoneyInput name="opening" defaultValue={pesos(account?.openingBalanceCents ?? 0)} /></Field>
      </div>
    </FormModal>
  )
}

export function ExpenseForm({ batchId }: { batchId?: string }) {
  const { view, close, submit } = useApp()
  const batch = batchId ? view.batches.find((item) => item.id === batchId) : undefined
  const accounts = view.accounts.filter((account) => account.active)
  const suppliers = view.suppliers.filter((supplier) => supplier.active)
  return (
    <FormModal open onClose={close} icon={Receipt} title="Registrar gasto" description={batch ? `Asociado a ${batch.name}` : undefined} submitLabel="Guardar gasto"
      onSubmit={(form) => submit(createExpense({ description: text(form, 'description'), amountCents: toCents(form.get('amount')), category: text(form, 'category'), supplierId: text(form, 'supplierId') || undefined, batchId, accountId: text(form, 'accountId') || undefined, notes: text(form, 'notes') }), 'Gasto registrado').then((error) => { if (!error) close(); return error })}>
      <FormSection>
        <Field label="En qué se gastó" className="sm:col-span-2"><Input name="description" required autoFocus defaultValue={batch ? `Pago ${batch.name}` : ''} placeholder="Pago a fábrica" /></Field>
        <Field label="Importe"><MoneyInput name="amount" required defaultValue={batch ? pesos(batch.costCents) : ''} /></Field>
        <Field label="Categoría"><Select name="category" defaultValue="factory">{Object.entries(EXPENSE_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
        {suppliers.length > 0 && <Field label="Proveedor" optional><Select name="supplierId" defaultValue={batch?.supplierId ?? ''}><option value="">Ninguno</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></Field>}
        {accounts.length > 0 && <Field label="Sale de la cuenta" optional><Select name="accountId" defaultValue=""><option value="">No descontar de caja</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {money(account.balanceCents)}</option>)}</Select></Field>}
        <Field label="Notas" optional className="sm:col-span-2"><Input name="notes" /></Field>
      </FormSection>
    </FormModal>
  )
}

export function MovementForm({ accountId }: { accountId?: string }) {
  const { view, close, submit } = useApp()
  const accounts = view.accounts.filter((account) => account.active)
  const [type, setType] = useState<'income' | 'expense'>('income')
  return (
    <FormModal open onClose={close} size="sm" icon={ArrowLeftRight} title="Movimiento de caja" description="Para aportes, retiros o ajustes que no son un pago ni un gasto." submitLabel="Guardar movimiento"
      onSubmit={(form) => submit(createCashMovement({ accountId: text(form, 'accountId'), type, amountCents: toCents(form.get('amount')), description: text(form, 'description') }), 'Movimiento guardado').then((error) => { if (!error) close(); return error })}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          {([['income', 'Entra plata'], ['expense', 'Sale plata']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setType(value)} className={cn('h-10 rounded-lg text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-slate-950', type === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500')}>{label}</button>)}
        </div>
        <Field label="Cuenta"><Select name="accountId" required defaultValue={accountId ?? (accounts.length === 1 ? accounts[0].id : '')}><option value="" disabled>Elegí…</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></Field>
        <Field label="Importe"><MoneyInput name="amount" required autoFocus /></Field>
        <Field label="Descripción"><Input name="description" required placeholder={type === 'income' ? 'Aporte propio' : 'Retiro'} /></Field>
      </div>
    </FormModal>
  )
}
