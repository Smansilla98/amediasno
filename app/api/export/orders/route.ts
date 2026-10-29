import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import PDFDocument from 'pdfkit'
import { getWorkspace, type Workspace } from '@/app/actions/workspace'
import { BRAND, BATCH_STATUS, EXPENSE_CATEGORIES, ORDER_STATUS, PAYMENT_STATUS, formatDate, fullName, labelOf, money } from '@/lib/domain'
import { buildView } from '@/lib/view'
import { getSessionUser } from '@/lib/session'

type Cell = string | number
type Sheet = { title: string; columns: string[]; rows: Cell[][]; moneyColumns?: number[] }

const pesos = (cents: number) => cents / 100

function build(kind: string, w: Workspace): Sheet {
  const customer = new Map(w.customers.map((row) => [row.id, row.name]))
  const product = new Map(w.products.map((row) => [row.id, row]))
  const order = new Map(w.orders.map((row) => [row.id, row]))
  const account = new Map(w.accounts.map((row) => [row.id, row.name]))
  const supplier = new Map(w.suppliers.map((row) => [row.id, row.name]))
  switch (kind) {
    case 'clientes':
      return { title: 'Clientes', columns: ['Nombre', 'Teléfono', 'Email', 'Pedidos', 'Comprado', 'Saldo', 'Notas'], moneyColumns: [4, 5],
        rows: w.customers.map((row) => { const own = w.orders.filter((o) => o.customerId === row.id && o.status !== 'cancelled'); return [row.name, row.phone ?? '', row.email ?? '', own.length, pesos(own.reduce((s, o) => s + o.totalCents, 0)), pesos(own.reduce((s, o) => s + o.totalCents - o.paidCents, 0)), row.notes ?? ''] }) }
    case 'productos':
      return { title: 'Productos y stock', columns: ['Producto', 'Categoría', 'Color', 'Talles', 'Costo', 'Precio', 'En mano', 'Reservado', 'Disponible', 'En camino', 'Activo', 'Stock por talle'], moneyColumns: [4, 5],
        rows: buildView(w).products.map((row) => [row.name, row.category, row.color ?? '', row.sizes.join(' / '), pesos(row.costCents), pesos(row.priceCents), row.stock, row.reservedStock, row.availableStock, row.requestedStock, row.active ? 'Sí' : 'No', row.inventory.map((item) => `${item.size || 'Sin talle'}: ${item.available} disp. / ${item.stock} en mano`).join('; ')]) }
    case 'pagos':
      return { title: 'Pagos', columns: ['Fecha', 'Pedido', 'Cliente', 'Importe', 'Medio', 'Notas'], moneyColumns: [3],
        rows: w.payments.map((row) => { const o = order.get(row.orderId); return [formatDate(row.paidAt), o?.code ?? '', o ? customer.get(o.customerId) ?? '' : '', pesos(row.amountCents), row.method, row.notes ?? ''] }) }
    case 'gastos':
      return { title: 'Gastos', columns: ['Fecha', 'Descripción', 'Categoría', 'Proveedor', 'Importe', 'Notas'], moneyColumns: [4],
        rows: w.expenses.map((row) => [formatDate(row.paidAt), row.description, labelOf(EXPENSE_CATEGORIES, row.category), row.supplierId ? supplier.get(row.supplierId) ?? '' : '', pesos(row.amountCents), row.notes ?? '']) }
    case 'caja':
      return { title: 'Movimientos de caja', columns: ['Fecha', 'Cuenta', 'Tipo', 'Descripción', 'Importe'], moneyColumns: [4],
        rows: w.movements.map((row) => [formatDate(row.occurredAt), account.get(row.accountId) ?? '', row.type === 'income' ? 'Ingreso' : 'Egreso', row.description, pesos(row.type === 'income' ? row.amountCents : -row.amountCents)]) }
    case 'tandas':
      return { title: 'Pedidos a fábrica', columns: ['Pedido', 'Proveedor', 'Tipo', 'Estado', 'Pedido el', 'Esperado', 'Recibido', 'Ventas', 'Unidades', 'Para stock', 'Detalle'],
        rows: buildView(w).batches.map((row) => [row.name, row.supplierName, row.kind, labelOf(BATCH_STATUS, row.status), formatDate(row.requestedAt), formatDate(row.expectedAt), formatDate(row.receivedAt), row.orders.length, row.units, row.stockUnits, row.lines.map((line) => `${line.quantity}× ${line.name}${line.size ? ` (${line.size})` : ''}`).join('; ')]) }
    default:
      return { title: 'Ventas', columns: ['Código', 'Fecha', 'Cliente', 'Para', 'Productos', 'Bloque', 'Profesor/a', 'Sede', 'Estado', 'Pago', 'Total', 'Pagado', 'Saldo', 'Entrega', 'Notas'], moneyColumns: [10, 11, 12],
        rows: w.orders.map((row) => [row.code, formatDate(row.createdAt), customer.get(row.customerId) ?? '', fullName(row.firstName, row.lastName),
          w.items.filter((item) => item.orderId === row.id).map((item) => `${item.quantity}× ${product.get(item.productId)?.name ?? 'Producto'}${item.size ? ` (${item.size})` : ''}`).join('; ') || (row.size ?? ''),
          row.block ?? '', row.professor ?? '', row.venue ?? '', labelOf(ORDER_STATUS, row.status), labelOf(PAYMENT_STATUS, row.paymentStatus), pesos(row.totalCents), pesos(row.paidCents), pesos(row.totalCents - row.paidCents), formatDate(row.deliveryDate), row.notes ?? '']) }
  }
}

const csvCell = (value: Cell) => typeof value === 'number' ? String(value) : `"${value.replace(/"/g, '""')}"`

function pdf(sheet: Sheet) {
  const doc = new PDFDocument({ margin: 32, size: 'A4', layout: 'landscape' })
  const chunks: Buffer[] = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))
  const width = doc.page.width - 64
  const columnWidth = width / sheet.columns.length
  const header = () => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569')
    const y = doc.y
    sheet.columns.forEach((column, index) => doc.text(column.toUpperCase(), 32 + index * columnWidth, y, { width: columnWidth - 6, lineBreak: false, ellipsis: true }))
    doc.moveTo(32, y + 13).lineTo(32 + width, y + 13).strokeColor('#cbd5e1').stroke()
    doc.y = y + 19
  }
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a').text(`${sheet.title} · ${BRAND}`)
  doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(`Generado el ${formatDate(new Date())} · ${sheet.rows.length} filas`).moveDown()
  header()
  if (!sheet.rows.length) doc.font('Helvetica').fontSize(10).fillColor('#64748b').text('No hay datos para exportar.', 32)
  for (const row of sheet.rows) {
    const cells = row.map((cell, index) => typeof cell === 'number' && sheet.moneyColumns?.includes(index) ? money(cell * 100) : String(cell))
    doc.font('Helvetica').fontSize(8)
    const height = Math.max(...cells.map((cell) => doc.heightOfString(cell, { width: columnWidth - 6 }))) + 6
    if (doc.y + height > doc.page.height - 40) { doc.addPage(); header() }
    const y = doc.y
    doc.fillColor('#0f172a')
    cells.forEach((cell, index) => doc.text(cell, 32 + index * columnWidth, y, { width: columnWidth - 6 }))
    doc.y = y + height
  }
  doc.end()
  return done
}

export async function GET(request: Request) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const format = params.get('format') ?? 'csv'
  const kind = params.get('tipo') ?? 'pedidos'
  const workspace = await getWorkspace()
  const sheet = build(kind, workspace)
  const filename = `${kind}-${new Date().toISOString().slice(0, 10)}`
  const attachment = (extension: string) => ({ 'Content-Disposition': `attachment; filename="${filename}.${extension}"` })

  if (format === 'json') {
    const data = sheet.rows.map((row) => Object.fromEntries(sheet.columns.map((column, index) => [column, row[index]])))
    return new NextResponse(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', ...attachment('json') } })
  }
  if (format === 'xlsx') {
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([sheet.columns, ...sheet.rows])
    worksheet['!cols'] = sheet.columns.map((column, index) => ({ wch: Math.min(40, Math.max(column.length, ...sheet.rows.map((row) => String(row[index]).length)) + 2) }))
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.title.slice(0, 31))
    return new NextResponse(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ...attachment('xlsx') } })
  }
  if (format === 'pdf') return new NextResponse(new Uint8Array(await pdf(sheet)), { headers: { 'Content-Type': 'application/pdf', ...attachment('pdf') } })

  // BOM para que Excel abra los acentos bien; punto y coma porque es el separador en Argentina.
  const csv = '﻿' + [sheet.columns, ...sheet.rows].map((row) => row.map(csvCell).join(';')).join('\r\n')
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', ...attachment('csv') } })
}
