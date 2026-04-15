import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata = {
  title: 'Sign In — SmartChiro',
}

export default async function LoginPage() {
  const session = await auth()
  if (session) redirect('/dashboard')

  const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <LoginForm googleEnabled={googleEnabled} />
    </div>
  )
}
