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
      icon: <CheckCircle2 size={24} className="text-success" />,
      title: 'Email verified!',
      message: 'Your email has been verified successfully. You can now sign in to your account.',
      color: '#30B130',
    },
    'already-verified': {
      icon: <CheckCircle2 size={24} className="text-info" />,
      title: 'Already verified',
      message: 'Your email address has already been verified. You can sign in to your account.',
      color: '#0570DE',
    },
    expired: {
      icon: <AlertTriangle size={24} className="text-warning" />,
      title: 'Link expired',
      message: 'This verification link has expired. Please request a new one by signing in with your credentials.',
      color: '#F5A623',
    },
    invalid: {
      icon: <XCircle size={24} className="text-danger" />,
      title: 'Invalid link',
      message: 'This verification link is invalid or has already been used.',
      color: '#DF1B41',
    },
  }

  const current = config[status || ''] || {
    icon: <Mail size={24} className="text-brand" />,
    title: 'Check your email',
    message: 'We sent you a verification link. Please check your inbox and click the link to verify your account.',
    color: '#533afd',
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-105">
        <div className="mb-8 text-center flex flex-col items-center">
          <div className="mb-4 rounded-panel bg-brand px-3 py-2">
            <span className="text-[14px] font-bold text-white">Smart Chiro</span>
          </div>
        </div>

        <div className="rounded-panel border border-border bg-white p-6 shadow-(--shadow-card) text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center">
            {current.icon}
          </div>
          <h1 className="text-[23px] font-semibold text-foreground">
            {current.title}
          </h1>
          <p className="mt-2 text-[15px] text-foreground leading-relaxed">
            {current.message}
          </p>

          <Link
            href="/login"
            className="mt-6 flex h-10 w-full items-center justify-center rounded-md bg-primary text-[15px] font-medium text-white transition-colors hover:bg-primary/90"
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
