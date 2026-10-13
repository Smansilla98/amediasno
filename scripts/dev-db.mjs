// Postgres local para desarrollo, sin Docker. Guarda los datos en .data/pg.
// Uso: pnpm db:dev   (dejalo corriendo en otra terminal)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import EmbeddedPostgres from 'embedded-postgres'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.DEV_DB_PORT || 5433)
const databaseDir = join(root, '.data/pg')
const url = `postgresql://postgres:postgres@localhost:${port}/medias`

const envFile = join(root, '.env.local')
if (!existsSync(envFile)) {
  writeFileSync(envFile, [
    `DATABASE_URL=${url}`,
    `BETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}`,
    'BETTER_AUTH_URL=http://localhost:3000',
    '',
  ].join('\n'))
  console.log('Creé .env.local con la base local.')
}

const nueva = !existsSync(join(databaseDir, 'PG_VERSION'))
mkdirSync(dirname(databaseDir), { recursive: true })
const pg = new EmbeddedPostgres({ databaseDir, user: 'postgres', password: 'postgres', port, persistent: true, onLog: () => {} })
if (nueva) await pg.initialise()
await pg.start()
if (nueva) await pg.createDatabase('medias')

process.env.DATABASE_URL = url
const { setup } = await import('./db-setup.mjs')
await setup(url)
console.log(`Postgres local en ${url}\nCtrl+C para detenerlo.`)

const stop = async () => { await pg.stop(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
