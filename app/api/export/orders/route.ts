import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { orders } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: new Headers(request.headers) })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const format = new URL(request.url).searchParams.get('format') === 'json' ? 'json' : 'csv'
  const rows = await db.select().from(orders).where(eq(orders.userId, session.user.id)).orderBy(desc(orders.createdAt))
  if (format === 'json') return new NextResponse(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="pedidos.json"' } })
  const fields = ['code','firstName','lastName','size','block','professor','venue','status','paymentStatus','totalCents','paidCents','deliveryDate'] as const
  const csv = [fields.join(','), ...rows.map((row) => fields.map((field) => JSON.stringify(row[field] ?? '')).join(','))].join('\n')
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="pedidos.csv"' } })
}
