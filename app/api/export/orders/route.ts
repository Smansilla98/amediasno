import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { orders } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await db.select().from(orders).where(eq(orders.userId, session.user.id))
  const format = new URL(request.url).searchParams.get('format') || 'json'
  if (format === 'csv') {
    const header = 'id,code,status,payment_status,total_cents,paid_cents,created_at'
    const body = rows.map((row) => [row.id, row.code, row.status, row.paymentStatus, row.totalCents, row.paidCents, row.createdAt.toISOString()].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    return new NextResponse(`${header}\n${body}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="pedidos.csv"' } })
  }
  return NextResponse.json(rows, { headers: { 'Content-Disposition': 'attachment; filename="pedidos.json"' } })
}
