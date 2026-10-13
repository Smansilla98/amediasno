import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { orders } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import * as XLSX from 'xlsx'
import PDFDocument from 'pdfkit'

const fields = ['code','firstName','lastName','size','block','professor','venue','status','paymentStatus','totalCents','paidCents','deliveryDate'] as const

async function getRows(request: Request) {
  const session = await auth.api.getSession({ headers: new Headers(request.headers) })
  if (!session?.user) return null
  return db.select().from(orders).where(eq(orders.userId, session.user.id)).orderBy(desc(orders.createdAt))
}

export async function GET(request: Request) {
  const rows = await getRows(request)
  if (!rows) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const format = new URL(request.url).searchParams.get('format') ?? 'csv'
  const data = rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field] ?? ''])))
  const filename = `pedidos-${new Date().toISOString().slice(0, 10)}`
  if (format === 'json') return new NextResponse(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}.json"` } })
  if (format === 'xlsx') {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), 'Pedidos')
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    return new NextResponse(buffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${filename}.xlsx"` } })
  }
  if (format === 'pdf') {
    const doc = new PDFDocument({ margin: 36 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk))
    const complete = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))
    doc.fontSize(18).text('Pedidos - Medias', { underline: true }).moveDown().fontSize(9).text(`Generado: ${new Date().toLocaleString('es-AR')}`).moveDown()
    if (!rows.length) doc.text('No hay pedidos para exportar.')
    rows.forEach((row) => doc.fontSize(10).text(`${row.code} | ${row.firstName ?? ''} ${row.lastName ?? ''} | ${row.status} | Total $${((row.totalCents ?? 0) / 100).toLocaleString('es-AR')} | Seña $${((row.paidCents ?? 0) / 100).toLocaleString('es-AR')}`).moveDown(0.4))
    doc.end()
    return new NextResponse(await complete, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}.pdf"` } })
  }
  const csv = [fields.join(','), ...rows.map((row) => fields.map((field) => JSON.stringify(row[field] ?? '')).join(','))].join('\n')
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}.csv"` } })
}
