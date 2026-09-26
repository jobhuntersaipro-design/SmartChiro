import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { hasSessionUser } from '@/lib/has-session-user'
import { ForgotPasswordForm } from './ForgotPasswordForm'

export const metadata = {
  title: 'Forgot Password — SmartChiro',
}

export default async function ForgotPasswordPage() {
  const session = await auth()
  if (hasSessionUser(session)) redirect('/dashboard')

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <ForgotPasswordForm />
    </div>
  )
}
