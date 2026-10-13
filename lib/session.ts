import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

/** Error con un mensaje pensado para mostrarle a la persona. */
export class UserError extends Error {}

export async function requireUserId() {
  const user = await getSessionUser()
  if (!user) throw new UserError('Tu sesión venció. Volvé a ingresar.')
  return user.id
}

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Envuelve una acción del servidor. En producción Next oculta el mensaje de los
 * errores lanzados, así que los de validación viajan como resultado.
 */
export async function run<T>(fn: (userId: string) => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn(await requireUserId()) }
  } catch (error) {
    if (error instanceof UserError) return { ok: false, error: error.message }
    console.error(error)
    return { ok: false, error: 'No se pudo guardar. Probá de nuevo en un momento.' }
  }
}
