import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const AUTH_PAGES = ['/sign-in', '/sign-up']

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  const onAuthPage = AUTH_PAGES.includes(request.nextUrl.pathname)
  if (!session?.user && !onAuthPage) return NextResponse.redirect(new URL('/sign-in', request.url))
  if (session?.user && onAuthPage) return NextResponse.redirect(new URL('/', request.url))
  return NextResponse.next()
}

export const config = {
  // Todo menos la API de sesión, el healthcheck, los archivos estáticos y las imágenes públicas.
  matcher: ['/((?!api/auth|api/health|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
}
