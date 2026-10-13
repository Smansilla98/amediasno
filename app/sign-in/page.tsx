'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createAuthClient } from 'better-auth/react'

const authClient = createAuthClient()

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const result = await authClient.signIn.email({ email, password })
    if (result.error) setError('No se pudo iniciar sesión. Revisá tus datos.')
    else { router.push('/'); router.refresh() }
    setLoading(false)
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] p-4"><form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div><h1 className="text-xl font-bold">Ingresar a Medias</h1><p className="mt-1 text-sm text-slate-500">Gestioná tus pedidos y pagos.</p></div><label className="flex flex-col gap-2 text-sm font-medium">Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-500" /></label><label className="flex flex-col gap-2 text-sm font-medium">Contraseña<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-500" /></label>{error && <p className="text-sm text-red-600">{error}</p>}<button disabled={loading} className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Ingresando…' : 'Ingresar'}</button></form></main>
}
