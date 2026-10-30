import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { pool } from '@/lib/db'
import { signUpOpen } from '@/lib/signup'

const dev = process.env.NODE_ENV === 'development'
/** Deja sólo el origen (https://dominio): tolera comillas, espacios, barra final o una ruta pegada. */
const originOf = (value: string | null | undefined) => {
  try { return value ? new URL(value.trim().replace(/^["']|["']$/g, '')).origin : undefined } catch { return undefined }
}
const configuredURL = originOf(process.env.BETTER_AUTH_URL)
if (process.env.BETTER_AUTH_URL && !configuredURL) console.warn('BETTER_AUTH_URL no es una URL válida: se usa el dominio de la request.')
const v0Origins = [process.env.V0_RUNTIME_URL, process.env.V0_DEV_APP_URL, process.env.V0_BUILD_URL, process.env.V0_SANDBOX_URL].filter(Boolean) as string[]
// Railway publica el dominio en RAILWAY_PUBLIC_DOMAIN; en Vercel, VERCEL_URL. BETTER_AUTH_URL siempre manda.
const hostedOrigins = [process.env.RAILWAY_PUBLIC_DOMAIN, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL].filter(Boolean).map((host) => `https://${host}`)
// El preview de v0 corre dentro de un iframe en otro dominio: sólo ahí hacen falta cookies de terceros.
const embedded = dev && v0Origins.length > 0

function requestOrigin(request: Request | undefined) {
  const host = request?.headers.get('x-forwarded-host')?.split(',')[0].trim() || request?.headers.get('host')
  if (!host) return []
  const proto = request?.headers.get('x-forwarded-proto')?.split(',')[0].trim() || (dev ? 'http' : 'https')
  const origin = originOf(`${proto}://${host}`)
  return origin ? [origin] : []
}

export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  baseURL: configuredURL || hostedOrigins[0] || process.env.V0_RUNTIME_URL || (dev ? 'http://localhost:3000' : undefined),
  // Además del dominio configurado, el propio dominio por el que entró la request (Host del proxy de
  // Railway): un BETTER_AUTH_URL mal escrito no bloquea el ingreso. Un sitio ajeno sigue rechazado,
  // porque su Origin no coincide con nuestro Host.
  trustedOrigins: (request) => [...(dev ? ['http://localhost:3000'] : []), ...v0Origins, ...hostedOrigins, ...(configuredURL ? [configuredURL] : []), ...requestOrigin(request)],
  // El registro se controla acá y no sólo en la página: también bloquea llamadas directas a la API.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/sign-up/email' && !(await signUpOpen())) throw APIError.from('FORBIDDEN', { message: 'El registro está cerrado.', code: 'SIGN_UP_CLOSED' })
    }),
  },
  ...(embedded ? { advanced: { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } } } : {}),
})
