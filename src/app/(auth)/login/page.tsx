import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { hasSessionUser } from '@/lib/has-session-user'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata = {
  title: 'Sign In — SmartChiro',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>
}) {
  const session = await auth()
  if (hasSessionUser(session)) redirect('/dashboard')

  const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)
  const { reset } = await searchParams
  const resetSuccess = reset === 'success'

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <LoginForm googleEnabled={googleEnabled} resetSuccess={resetSuccess} />
    </div>
  )
}
