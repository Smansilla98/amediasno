'use client'

import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { importCustomers, importProducts } from '@/app/actions/import'
import { useApp } from '@/components/app/store'
import { Button, Textarea } from '@/components/ui/controls'
import { FormModal } from '@/components/ui/modal'
import { money } from '@/lib/domain'
import { customerKey, parseCustomers, parseProducts, parseTable, productKey, type CustomerImport, type ProductImport } from '@/lib/import'
import { cn } from '@/lib/utils'

export type ImportKind = 'products' | 'customers'

const TEMPLATES: Record<ImportKind, { file: string; header: string[]; example: string[][]; help: string[] }> = {
  products: {
    file: 'plantilla-productos.xlsx',
    header: ['Producto', 'Categoría', 'Color', 'Precio', 'Costo', 'XS', 'S', 'M', 'L', 'XL', '2XL', 'Sin talle'],
    example: [
      ['Buzo canguro', 'Buzos', 'Negro', '25000', '12000', '', '2', '5', '3', '0', '', ''],
      ['Buzo canguro', 'Buzos', 'Gris', '25000', '12000', '', '1', '4', '2', '', '', ''],
      ['Medias largas', 'Medias', 'Blanco', '3500', '1500', '', '', '', '', '', '', '20'],
    ],
    help: [
      'Una fila por producto (y color). Producto es lo único obligatorio.',
      'En cada columna de talle poné cuántas unidades tenés. Si ese talle existe pero hoy no tenés, poné 0; si el producto no viene en ese talle, dejala vacía.',
      'Si el producto no tiene talles, usá «Sin talle».',
      'También sirve una fila por talle con columnas «Talle» y «Stock».',
      'Si el producto ya existe (mismo nombre y color) se actualiza: no se duplica.',
    ],
  },
  customers: {
    file: 'plantilla-clientes.xlsx',
    header: ['Nombre', 'Apellido', 'Teléfono', 'Email', 'Notas'],
    example: [['Ana', 'Pérez', '11 5555-1234', 'ana@mail.com', 'Talle M'], ['Grupo de danza Sur', '', '11 4444-0000', '', 'Compra por mayor']],
    help: ['Una fila por cliente. Nombre es lo único obligatorio.', 'Los clientes que ya están cargados (mismo teléfono, o mismo nombre si no hay teléfono) se saltean.'],
  },
}

async function downloadTemplate(kind: ImportKind) {
  const XLSX = await import('xlsx')
  const template = TEMPLATES[kind]
  const book = XLSX.utils.book_new()
  const main = XLSX.utils.aoa_to_sheet([template.header])
  main['!cols'] = template.header.map((title) => ({ wch: Math.max(10, title.length + 4) }))
  XLSX.utils.book_append_sheet(book, main, kind === 'products' ? 'Productos' : 'Clientes')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([template.header, ...template.example]), 'Ejemplo')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Cómo completarla'], ...template.help.map((line) => [line]), [], ['Completá la primera hoja. La hoja «Ejemplo» no se importa.']]), 'Instrucciones')
  XLSX.writeFile(book, template.file)
}

/** Lee un .xlsx/.xls/.csv. De Excel se toma sólo la primera hoja. */
async function readFile(file: File): Promise<string[][]> {
  if (/\.(csv|txt|tsv)$/i.test(file.name)) return parseTable(await file.text())
  const XLSX = await import('xlsx')
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheet = book.Sheets[book.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', blankrows: false })
  return rows.map((row) => row.map((value) => String(value ?? '').trim())).filter((row) => row.some(Boolean))
}

export function ImportForm({ kind }: { kind: ImportKind }) {
  const { view, close, submit, notify } = useApp()
  const [rows, setRows] = useState<string[][] | null>(null)
  const [source, setSource] = useState('')
  const [pasted, setPasted] = useState('')
  const [stockMode, setStockMode] = useState<'set' | 'add'>('set')
  const fileInput = useRef<HTMLInputElement>(null)
  const products = kind === 'products'

  const productData = useMemo(() => (products && rows ? parseProducts(rows) : null), [rows, products])
  const customerData = useMemo(() => (!products && rows ? parseCustomers(rows) : null), [rows, products])
  const parsed = productData ?? customerData
  const existingProducts = useMemo(() => new Set(view.products.map(productKey)), [view.products])
  const existingCustomers = useMemo(() => new Set(view.customers.map(customerKey)), [view.customers])

  async function pickFile(file: File | undefined) {
    if (!file) return
    try {
      setRows(await readFile(file))
      setSource(file.name)
    } catch {
      notify('No pude leer ese archivo. Probá guardarlo como Excel (.xlsx) o CSV.', true)
    }
  }
  const readPasted = (text: string) => { setPasted(text); setRows(text.trim() ? parseTable(text) : null); setSource(text.trim() ? 'Texto pegado' : '') }
  const reset = () => { setRows(null); setSource(''); setPasted(''); if (fileInput.current) fileInput.current.value = '' }

  const items = parsed?.items ?? []
  const blocked = !items.length || !!parsed?.issues.length
  const isNewProduct = (item: ProductImport) => !existingProducts.has(productKey(item))
  const isNewCustomer = (item: CustomerImport) => !existingCustomers.has(customerKey(item))
  const newCount = productData ? productData.items.filter(isNewProduct).length : customerData ? customerData.items.filter(isNewCustomer).length : 0
  const units = productData?.items.reduce((sum, item) => sum + Object.values(item.stock).reduce((total, quantity) => total + quantity, 0), 0) ?? 0

  async function save() {
    let done = ''
    const error = productData
      ? await submit(importProducts({ items: productData.items, stockMode }).then((result) => { if (result.ok) done = `Listo: ${result.data.created} productos nuevos, ${result.data.updated} actualizados, ${result.data.units} unidades`; return result }))
      : customerData
        ? await submit(importCustomers({ items: customerData.items }).then((result) => { if (result.ok) done = `Listo: ${result.data.created} clientes nuevos${result.data.skipped ? `, ${result.data.skipped} ya estaban` : ''}`; return result }))
        : 'Pegá o subí una planilla.'
    if (error) return error
    notify(done)
    close()
  }

  return (
    <FormModal open onClose={close} size="lg" icon={FileSpreadsheet} title={products ? 'Importar productos y stock' : 'Importar clientes'} description="Desde Excel, Google Sheets o un CSV."
      submitLabel={items.length ? `Importar ${items.length} ${products ? 'productos' : 'clientes'}` : 'Importar'} submitDisabled={blocked}
      summary={items.length ? <>{newCount} nuevos · {items.length - newCount} {products ? 'se actualizan' : 'ya estaban'}{products && <> · <strong className="text-slate-950">{units} unidades</strong></>}</> : undefined}
      onSubmit={save}>
      <div className="space-y-5">
        <ol className="grid gap-3 sm:grid-cols-3">
          <li className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">1 · Plantilla</p>
            <p className="mt-1 text-sm text-slate-600">Bajala, completala o copiá ahí tus datos.</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => downloadTemplate(kind)}><Download className="size-3.5" /> Descargar Excel</Button>
          </li>
          <li className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">2 · Subila o pegala</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" className="sr-only" aria-label="Archivo de planilla" onChange={(event) => pickFile(event.target.files?.[0])} />
              <Button size="sm" onClick={() => fileInput.current?.click()}><Upload className="size-3.5" /> Subir archivo</Button>
              <span className="text-xs text-slate-500">o seleccioná las celdas en tu planilla (con los títulos), copiá y pegá abajo.</span>
            </div>
            <Textarea value={pasted} onChange={(event) => readPasted(event.target.value)} placeholder={TEMPLATES[kind].header.join('\t')} aria-label="Pegar planilla" className="mt-2 min-h-24 font-mono text-xs" />
          </li>
        </ol>

        <details className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-800">Cómo tiene que estar la planilla</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">{TEMPLATES[kind].help.map((line) => <li key={line}>{line}</li>)}</ul>
        </details>

        {parsed && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">Vista previa · {source}</p>
              <Button size="sm" variant="ghost" onClick={reset}>Empezar de nuevo</Button>
            </div>
            {parsed.issues.length > 0 && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <p className="font-semibold">Corregí esto en la planilla y volvé a cargarla:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">{parsed.issues.slice(0, 12).map((issue, index) => <li key={index}>{issue.line ? `Fila ${issue.line}: ` : ''}{issue.message}</li>)}</ul>
                {parsed.issues.length > 12 && <p className="mt-1">…y {parsed.issues.length - 12} más.</p>}
              </div>
            )}
            {parsed.ignored.length > 0 && <p className="text-xs text-amber-700">No se usan estas columnas: {parsed.ignored.join(', ')}.</p>}
            {productData && productData.items.some((item) => !isNewProduct(item)) && (
              <fieldset className="rounded-xl border border-slate-200 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-900">Productos que ya existen: ¿qué hago con el stock?</legend>
                {([['set', 'Reemplazarlo por lo de la planilla', 'La planilla es un conteo: cada talle queda con esa cantidad.'], ['add', 'Sumarlo a lo que ya hay', 'La planilla es mercadería que entra.']] as const).map(([value, label, hint]) => (
                  <label key={value} className="mt-2 flex cursor-pointer items-start gap-2.5 text-sm">
                    <input type="radio" name="stockMode" value={value} checked={stockMode === value} onChange={() => setStockMode(value)} className="mt-0.5 size-4 accent-slate-950" />
                    <span><span className="font-medium text-slate-900">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span>
                  </label>
                ))}
              </fieldset>
            )}
            {items.length > 0 && (
              <div className="max-h-80 overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50"><tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {products ? <><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Precio</th><th className="px-3 py-2">Stock por talle</th></> : <><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Teléfono</th><th className="px-3 py-2">Email</th></>}
                    <th className="px-3 py-2 text-right" />
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {productData?.items.slice(0, 200).map((item) => (
                      <tr key={productKey(item)}>
                        <td className="px-3 py-2"><span className="font-medium text-slate-900">{item.name}</span><span className="block text-xs text-slate-500">{[item.category, item.color].filter(Boolean).join(' · ')}</span></td>
                        <td className="px-3 py-2 tabular-nums text-slate-700">{item.priceCents !== undefined ? money(item.priceCents) : '—'}</td>
                        <td className="px-3 py-2 text-xs text-slate-700">{Object.keys(item.stock).length ? Object.entries(item.stock).map(([size, quantity]) => `${size || 'Sin talle'}: ${quantity}`).join(' · ') : item.sizes.join(', ') || '—'}</td>
                        <td className="px-3 py-2 text-right"><Tag fresh={isNewProduct(item)} /></td>
                      </tr>
                    ))}
                    {customerData?.items.slice(0, 200).map((item, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 font-medium text-slate-900">{item.name}</td>
                        <td className="px-3 py-2 text-slate-700">{item.phone ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-700">{item.email ?? '—'}</td>
                        <td className="px-3 py-2 text-right"><Tag fresh={isNewCustomer(item)} skip /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {items.length > 200 && <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Se muestran 200 de {items.length}.</p>}
              </div>
            )}
          </section>
        )}
      </div>
    </FormModal>
  )
}

const Tag = ({ fresh, skip }: { fresh: boolean; skip?: boolean }) => <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', fresh ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>{fresh ? 'Nuevo' : skip ? 'Ya está' : 'Actualiza'}</span>
