import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'

const dev = process.env.NODE_ENV === 'development'
const v0Origins = [process.env.V0_RUNTIME_URL, process.env.V0_DEV_APP_URL, process.env.V0_BUILD_URL, process.env.V0_SANDBOX_URL].filter(Boolean) as string[]
// Railway publica el dominio en RAILWAY_PUBLIC_DOMAIN; en Vercel, VERCEL_URL. BETTER_AUTH_URL siempre manda.
const hostedOrigins = [process.env.RAILWAY_PUBLIC_DOMAIN, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL].filter(Boolean).map((host) => `https://${host}`)
// El preview de v0 corre dentro de un iframe en otro dominio: sólo ahí hacen falta cookies de terceros.
const embedded = dev && v0Origins.length > 0

export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  baseURL: process.env.BETTER_AUTH_URL || hostedOrigins[0] || process.env.V0_RUNTIME_URL || (dev ? 'http://localhost:3000' : undefined),
  trustedOrigins: [...(dev ? ['http://localhost:3000'] : []), ...v0Origins, ...hostedOrigins, ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : [])],
  ...(embedded ? { advanced: { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } } } : {}),
})
