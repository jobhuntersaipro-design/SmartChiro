import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
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
  if (session) redirect('/dashboard')

  const { token } = await searchParams

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 text-center flex flex-col items-center">
            <div className="mb-4 rounded-[6px] bg-[#533afd] px-3 py-2">
              <span className="text-[14px] font-bold text-white">Smart Chiro</span>
            </div>
            <h1 className="text-[23px] font-light text-[#061b31]">
              Invalid reset link
            </h1>
            <p className="mt-2 text-[15px] text-[#273951]">
              This password reset link is invalid.
            </p>
          </div>

          <Link
            href="/forgot-password"
            className="flex h-[40px] w-full items-center justify-center rounded-[4px] bg-[#533afd] text-[15px] font-medium text-white transition-colors hover:bg-[#4434d4]"
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
