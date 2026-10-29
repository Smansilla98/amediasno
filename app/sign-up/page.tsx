import { connection } from 'next/server'
import { AuthForm } from '@/components/app/auth-form'
import { signUpOpen } from '@/lib/signup'

export const metadata = { title: 'Crear cuenta · A medias No' }

export default async function SignUpPage() {
  await connection()
  return <AuthForm mode={(await signUpOpen()) ? 'sign-up' : 'closed'} />
}
