import { redirect } from 'next/navigation'
import { getWorkspace } from '@/app/actions/workspace'
import { App } from '@/components/app/app'
import { getSessionUser } from '@/lib/session'

export default async function Page({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const user = await getSessionUser()
  if (!user) redirect('/sign-in')
  const [{ v }, initial] = await Promise.all([searchParams, getWorkspace()])
  return <App initial={initial} user={{ name: user.name || user.email, email: user.email }} section={v} />
}
