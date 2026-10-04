import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { hasSessionUser } from '@/lib/has-session-user'
import { LoginForm } from '@/components/auth/LoginForm'
import { safeCallbackPath } from '@/lib/safe-callback'

export const metadata = {
  title: 'Sign In — SmartChiro',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; error?: string; callbackUrl?: string }>
}) {
  const { reset, error, callbackUrl: rawCallback } = await searchParams
  const callbackUrl = safeCallbackPath(rawCallback)
  const session = await auth()
  if (hasSessionUser(session)) redirect(callbackUrl)

  const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)
  const resetSuccess = reset === 'success'

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <LoginForm
        googleEnabled={googleEnabled}
        resetSuccess={resetSuccess}
        accountDisabled={error === 'account_disabled'}
        callbackUrl={callbackUrl}
      />
    </div>
  )
}
