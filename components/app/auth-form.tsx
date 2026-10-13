'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { createAuthClient } from 'better-auth/react'
import { Button, Field, Input } from '@/components/ui/controls'
import { BRAND } from '@/lib/domain'

const authClient = createAuthClient()

const ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'El email o la contraseña no coinciden.',
  USER_ALREADY_EXISTS: 'Ya hay una cuenta con ese email. Probá ingresar.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Ya hay una cuenta con ese email. Probá ingresar.',
  PASSWORD_TOO_SHORT: 'La contraseña tiene que tener al menos 8 caracteres.',
  INVALID_EMAIL: 'Revisá el email.',
}

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const signUp = mode === 'sign-up'
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))
    setLoading(true)
    setError('')
    const result = signUp
      ? await authClient.signUp.email({ name: String(form.get('name')).trim(), email, password })
      : await authClient.signIn.email({ email, password })
    if (result.error) {
      setError(ERRORS[result.error.code ?? ''] ?? (signUp ? 'No se pudo crear la cuenta. Revisá los datos.' : 'No se pudo iniciar sesión. Revisá tus datos.'))
      setLoading(false)
      return
    }
    // Navegación completa: la página siguiente se arma en el servidor ya con la sesión.
    window.location.href = '/'
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f6f7f9] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/medias-logo.jpg" alt="" width={64} height={64} priority className="rounded-full object-cover shadow-sm" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-950">{signUp ? 'Creá tu cuenta' : `Ingresá a ${BRAND}`}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{signUp ? 'Pedidos, pagos y fábrica en un solo lugar.' : 'Seguí tus pedidos, pagos y tandas de fábrica.'}</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {signUp && <Field label="Tu nombre"><Input name="name" required autoComplete="name" autoFocus /></Field>}
          <Field label="Email"><Input name="email" type="email" required autoComplete="email" inputMode="email" autoFocus={!signUp} /></Field>
          <Field label="Contraseña" hint={signUp ? 'Al menos 8 caracteres.' : undefined}><Input name="password" type="password" required minLength={signUp ? 8 : undefined} autoComplete={signUp ? 'new-password' : 'current-password'} /></Field>
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p>}
          <Button type="submit" disabled={loading} className="mt-1 w-full">{loading ? 'Un momento…' : signUp ? 'Crear cuenta' : 'Ingresar'}</Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          {signUp ? '¿Ya tenés cuenta? ' : '¿Todavía no tenés cuenta? '}
          <Link href={signUp ? '/sign-in' : '/sign-up'} className="font-semibold text-slate-950 underline underline-offset-4">{signUp ? 'Ingresar' : 'Crear cuenta'}</Link>
        </p>
      </div>
    </main>
  )
}
