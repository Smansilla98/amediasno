// Crea las tablas de la app y las de sesión en la base de DATABASE_URL.
// Uso: pnpm db:setup   (lee .env.local si existe)
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'
import { getMigrations } from 'better-auth/db/migration'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'))
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL (definila en .env.local).')
  process.exit(1)
}

export async function setup(connectionString = process.env.DATABASE_URL) {
  const pool = new pg.Pool({ connectionString })
  try {
    await pool.query(readFileSync(join(root, 'lib/db/setup.sql'), 'utf8'))
    const { runMigrations } = await getMigrations({ database: pool, emailAndPassword: { enabled: true } })
    await runMigrations()
  } finally {
    await pool.end()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await setup()
  console.log('Base lista.')
}
