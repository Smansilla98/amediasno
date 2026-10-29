import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'

/** Para el healthcheck de Railway: responde 200 solo si la base contesta. */
export async function GET() {
  try {
    await pool.query('select 1')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}
