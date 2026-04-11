import Link from 'next/link'
import { CheckCircle2, XCircle, AlertTriangle, Mail } from 'lucide-react'

export const metadata = {
  title: 'Verify Email — SmartChiro',
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams

  const config: Record<string, { icon: React.ReactNode; title: string; message: string; color: string }> = {
    success: {
      icon: <CheckCircle2 size={24} className="text-[#30B130]" />,
      title: 'Email verified!',
      message: 'Your email has been verified successfully. You can now sign in to your account.',
      color: '#30B130',
    },
    'already-verified': {
      icon: <CheckCircle2 size={24} className="text-[#0570DE]" />,
      title: 'Already verified',
      message: 'Your email address has already been verified. You can sign in to your account.',
      color: '#0570DE',
    },
    expired: {
      icon: <AlertTriangle size={24} className="text-[#F5A623]" />,
      title: 'Link expired',
      message: 'This verification link has expired. Please request a new one by signing in with your credentials.',
      color: '#F5A623',
    },
    invalid: {
      icon: <XCircle size={24} className="text-[#DF1B41]" />,
      title: 'Invalid link',
      message: 'This verification link is invalid or has already been used.',
      color: '#DF1B41',
    },
  }

  const current = config[status || ''] || {
    icon: <Mail size={24} className="text-[#635BFF]" />,
    title: 'Check your email',
    message: 'We sent you a verification link. Please check your inbox and click the link to verify your account.',
    color: '#635BFF',
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F9FC] px-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center flex flex-col items-center">
          <div className="mb-4 rounded-[6px] bg-[#635BFF] px-3 py-2">
            <span className="text-[14px] font-bold text-white">Smart Chiro</span>
          </div>
        </div>

        <div className="rounded-[6px] border border-[#E3E8EE] bg-white p-6 shadow-[var(--shadow-card)] text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center">
            {current.icon}
          </div>
          <h1 className="text-[23px] font-semibold text-[#0A2540]">
            {current.title}
          </h1>
          <p className="mt-2 text-[15px] text-[#425466] leading-relaxed">
            {current.message}
          </p>

          <Link
            href="/login"
            className="mt-6 flex h-[40px] w-full items-center justify-center rounded-[4px] bg-[#635BFF] text-[15px] font-medium text-white transition-colors hover:bg-[#5851EB]"
          >
            {status === 'success' || status === 'already-verified'
              ? 'Sign in to your account'
              : 'Back to sign in'}
          </Link>
        </div>
      </div>
    </div>
  )
}
