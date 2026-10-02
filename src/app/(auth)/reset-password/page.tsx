import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { hasSessionUser } from '@/lib/has-session-user'
import { ResetPasswordForm } from './ResetPasswordForm'

export const metadata = {
  title: 'Reset Password — SmartChiro',
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const session = await auth()
  if (hasSessionUser(session)) redirect('/dashboard')

  const { token } = await searchParams

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="w-full max-w-105">
          <div className="mb-8 text-center flex flex-col items-center">
            <div className="mb-4 rounded-panel bg-brand px-3 py-2">
              <span className="text-[14px] font-bold text-white">Smart Chiro</span>
            </div>
            <h1 className="text-[23px] font-medium text-foreground">
              Invalid reset link
            </h1>
            <p className="mt-2 text-[15px] text-foreground">
              This password reset link is invalid.
            </p>
          </div>

          <Link
            href="/forgot-password"
            className="flex h-10 w-full items-center justify-center rounded-control bg-primary text-[15px] font-medium text-white transition-colors hover:bg-primary/90"
          >
            Request a new reset link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <ResetPasswordForm token={token} />
    </div>
  )
}
