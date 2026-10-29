import { connection } from 'next/server'
import { AuthForm } from '@/components/app/auth-form'
import { signUpOpen } from '@/lib/signup'

export const metadata = { title: 'Ingresar · A medias No' }

export default async function SignInPage() {
  await connection()
  return <AuthForm mode="sign-in" canSignUp={await signUpOpen()} />
}
