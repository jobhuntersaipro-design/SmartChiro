'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { GoogleSignInButton } from './GoogleSignInButton'

export function LoginForm({
  googleEnabled = false,
  resetSuccess = false,
  accountDisabled = false,
}: {
  googleEnabled?: boolean
  resetSuccess?: boolean
  /** A Google sign-in was refused because a super admin disabled the account. */
  accountDisabled?: boolean
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(
    accountDisabled ? 'This account has been disabled. Contact SmartChiro support.' : '',
  )
  const [loading, setLoading] = useState(false)
  const [emailNotVerified, setEmailNotVerified] = useState(false)
  const [resending, setResending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setEmailNotVerified(false)
    setLoading(true)

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      if (result.code === 'email_not_verified') {
        setEmailNotVerified(true)
        return
      }
      if (result.code === 'too_many_attempts') {
        setError('Too many sign-in attempts. Wait a few minutes and try again, or reset your password.')
        return
      }
      if (result.code === 'account_disabled') {
        setError('This account has been disabled. Contact SmartChiro support.')
        return
      }
      setError('Invalid password or username')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  async function handleResendVerification() {
    setResending(true)
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setError('')
      setEmailNotVerified(false)
      setError('Verification email sent! Check your inbox.')
    } catch {
      // Silently handle
    }
    setResending(false)
  }

  return (
    <div className="w-full max-w-105">
      {/* Logo / Branding */}
      <div className="mb-8 text-center flex flex-col items-center">
        <div className="mb-4 rounded-panel bg-brand px-3 py-2">
          <span className="text-[14px] font-bold text-white">Smart Chiro</span>
        </div>
        <h1 className="text-[23px] font-medium text-foreground">
          Sign in to SmartChiro
        </h1>
        <p className="mt-1 text-[15px] text-fg-secondary">
          Enter your credentials to continue
        </p>
      </div>

      {/* Auth Card */}
      <div className="rounded-panel border border-border bg-white p-6" style={{ boxShadow: "var(--shadow-card)" }}>
        {resetSuccess && (
          <div className="mb-4 rounded-md border border-success/30 bg-success-subtle p-3">
            <p className="text-[14px] font-medium text-success">Password updated</p>
            <p className="mt-1 text-[13px] text-foreground">
              Sign in with your new password.
            </p>
          </div>
        )}
        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-[14px] font-medium text-foreground"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-10 w-full rounded-control border border-border bg-surface-muted px-3 text-[15px] text-foreground placeholder-fg-secondary transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-[14px] font-medium text-foreground"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-[13px] text-brand hover:underline transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="h-10 w-full rounded-control border border-border bg-surface-muted px-3 pr-10 text-[15px] text-foreground placeholder-fg-secondary transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-secondary hover:text-foreground cursor-pointer"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff size={16} strokeWidth={1.5} />
                ) : (
                  <Eye size={16} strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>

          {emailNotVerified && (
            <div className="rounded-md border border-warning/30 bg-warning-subtle p-3">
              <p className="text-[14px] text-foreground font-medium">Email not verified</p>
              <p className="mt-1 text-[13px] text-foreground">
                Please check your inbox and click the verification link.
              </p>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resending}
                className="mt-2 text-[13px] font-medium text-brand hover:text-brand-strong transition-colors cursor-pointer disabled:opacity-60"
              >
                {resending ? 'Sending...' : 'Resend verification email'}
              </button>
            </div>
          )}

          {error && (
            <p className="text-[14px] text-danger">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-10 w-full items-center justify-center rounded-control bg-primary text-[15px] font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        {/* Google Sign In */}
        {googleEnabled && (
          <>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[13px] text-fg-secondary">or continue with</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <GoogleSignInButton />
          </>
        )}
      </div>

      {/* Footer */}
      <p className="mt-6 text-center text-[14px] text-fg-secondary">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-brand hover:text-brand-strong transition-colors">Register Here</Link>
      </p>
    </div>
  )
}
