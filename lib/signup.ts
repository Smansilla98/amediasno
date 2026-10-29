import { pool } from '@/lib/db'

/**
 * ¿Se pueden crear cuentas nuevas? Por defecto sólo mientras no exista ninguna:
 * la primera cuenta que se crea es la del emprendimiento y después el registro se cierra.
 * ALLOW_SIGNUP=true lo abre (para sumar a alguien) y ALLOW_SIGNUP=false lo cierra del todo.
 * En desarrollo queda abierto para poder probar.
 */
export async function signUpOpen() {
  const flag = process.env.ALLOW_SIGNUP?.trim().toLowerCase()
  if (flag === 'true') return true
  if (flag === 'false') return false
  if (process.env.NODE_ENV === 'development') return true
  const { rows } = await pool.query<{ taken: boolean }>('select exists (select 1 from "user") as taken')
  return !rows[0]?.taken
}
