import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// Un solo pool por proceso: en desarrollo el módulo se recarga con cada cambio
// y sin esto se agotan las conexiones.
const globalForDb = globalThis as unknown as { __pool?: Pool }
export const pool = globalForDb.__pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })
if (process.env.NODE_ENV !== 'production') globalForDb.__pool = pool

export const db = drizzle(pool, { schema })
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
