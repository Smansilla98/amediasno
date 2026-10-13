import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'

const dev = process.env.NODE_ENV === 'development'
const v0Origins = [process.env.V0_RUNTIME_URL, process.env.V0_DEV_APP_URL, process.env.V0_BUILD_URL, process.env.V0_SANDBOX_URL].filter(Boolean) as string[]
const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map((host) => `https://${host}`)
// El preview de v0 corre dentro de un iframe en otro dominio: sólo ahí hacen falta cookies de terceros.
const embedded = dev && v0Origins.length > 0

export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  baseURL: process.env.BETTER_AUTH_URL || vercelOrigins[0] || process.env.V0_RUNTIME_URL || (dev ? 'http://localhost:3000' : undefined),
  trustedOrigins: [...(dev ? ['http://localhost:3000'] : []), ...v0Origins, ...vercelOrigins],
  ...(embedded ? { advanced: { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } } } : {}),
})
