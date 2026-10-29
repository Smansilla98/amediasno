'use client'

import { Boxes } from 'lucide-react'
import { useState } from 'react'
import { updateStock } from '@/app/actions/products'
import { useApp } from '@/components/app/store'
import { Field, Input } from '@/components/ui/controls'
import { FormModal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

/**
 * Carga de stock a mano de un producto, talle por talle.
 * - Ingreso: suma lo que entra (compra por fuera de un pedido a fábrica, devolución…).
 * - Conteo: deja cada talle en la cantidad real contada.
 */
export function StockForm({ id, mode: initialMode = 'add' }: { id: string; mode?: 'add' | 'set' }) {
  const { view, close, submit } = useApp()
  const product = view.products.find((row) => row.id === id)
  const [mode, setMode] = useState(initialMode)
  const [values, setValues] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  if (!product) return null
  // «Sin talle» de un producto con talles es stock viejo: solo se corrige con un conteo.
  const rows = product.inventory.filter((row) => mode === 'set' || !row.legacy)
  const valueOf = (size: string, stock: number) => values[size] ?? (mode === 'set' ? String(stock) : '')
  const quantities = Object.fromEntries(rows.map((row) => [row.size, Number(valueOf(row.size, row.stock) || 0)]))
  const delta = rows.reduce((sum, row) => sum + (mode === 'add' ? quantities[row.size] : quantities[row.size] - row.stock), 0)
  const switchMode = (next: 'add' | 'set') => { setMode(next); setValues({}) }

  return (
    <FormModal open onClose={close} icon={Boxes} title={mode === 'add' ? 'Ingreso de stock' : 'Corregir stock'} description={`${product.name}${product.color ? ` · ${product.color}` : ''}`} submitLabel={mode === 'add' ? 'Sumar al stock' : 'Guardar conteo'} submitDisabled={mode === 'add' && delta <= 0}
      summary={delta ? <>{delta > 0 ? 'Entran' : 'Salen'} <strong className="text-slate-950">{Math.abs(delta)} unidades</strong></> : <>Sin cambios</>}
      onSubmit={() => submit(updateStock({ productId: id, mode, quantities, notes }), 'Stock actualizado').then((error) => { if (!error) close(); return error })}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          {([['add', 'Ingreso'], ['set', 'Conteo']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => switchMode(value)} className={cn('h-10 rounded-lg text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-slate-950', mode === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500')}>{label}</button>)}
        </div>
        <p className="text-sm text-slate-500">{mode === 'add' ? 'Escribí cuántas unidades entran de cada talle. Lo que llega de un pedido a fábrica entra solo al recibirlo.' : 'Escribí cuántas unidades hay realmente de cada talle. Lo reservado para ventas no se puede bajar.'}</p>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th scope="col" className="px-3 py-2 text-left">Talle</th><th scope="col" className="px-2 py-2 text-right">Hay</th><th scope="col" className="px-2 py-2 text-right">Reservado</th><th scope="col" className="w-28 px-3 py-2 text-right">{mode === 'add' ? 'Entran' : 'Contaste'}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.size || 'sin-talle'}>
                  <th scope="row" className="px-3 py-2 text-left font-bold text-slate-900">{row.size || (product.sizes.length ? 'Sin talle' : 'Unidades')}{row.legacy && <span className="block text-[11px] font-normal text-amber-700">Stock viejo: pasalo a su talle</span>}</th>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-700">{row.stock}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500">{row.reserved || '—'}</td>
                  <td className="px-3 py-1.5"><Input type="number" inputMode="numeric" min={mode === 'set' ? row.reserved : 0} max={100000} value={valueOf(row.size, row.stock)} onChange={(event) => setValues((current) => ({ ...current, [row.size]: event.target.value }))} placeholder="0" aria-label={`${mode === 'add' ? 'Unidades que entran' : 'Unidades contadas'} ${row.size || 'sin talle'}`} className="h-10 text-center tabular-nums sm:h-9" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Field label="Motivo" optional><Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={mode === 'add' ? 'Compra, devolución…' : 'Conteo, rotura, regalo…'} /></Field>
      </div>
    </FormModal>
  )
}
