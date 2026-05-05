import NextAuth from 'next-auth'
import authConfig from '@/lib/auth.config'

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  // Legacy /dashboard/calendar → /dashboard/appointments (sidebar relabel 2026-05-05)
  if (pathname === '/dashboard/calendar' || pathname.startsWith('/dashboard/calendar/')) {
    const url = new URL(req.url)
    url.pathname = pathname.replace('/dashboard/calendar', '/dashboard/appointments')
    return Response.redirect(url, 308)
  }

  // Protect dashboard routes
  if (pathname.startsWith('/dashboard') && !isLoggedIn) {
    return Response.redirect(new URL('/login', req.url))
  }

  // Redirect logged-in users away from auth pages
  if (
    (pathname === '/login' ||
      pathname === '/register' ||
      pathname === '/forgot-password' ||
      pathname === '/reset-password') &&
    isLoggedIn
  ) {
    return Response.redirect(new URL('/dashboard', req.url))
  }
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
