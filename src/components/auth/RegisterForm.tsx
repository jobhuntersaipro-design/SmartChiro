'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, Mail, ArrowLeft } from 'lucide-react'
import { GoogleSignInButton } from './GoogleSignInButton'

export function RegisterForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [resending, setResending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registration failed. Please try again.')
        setLoading(false)
        return
      }

      setLoading(false)
      setEmailSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  async function handleResend() {
    setResending(true)
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch {
      // Silently fail — don't reveal info
    }
    setResending(false)
  }

  if (emailSent) {
    return (
      <div className="w-full max-w-105">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-panel bg-brand">
            <Mail size={24} className="text-white" />
          </div>
          <h1 className="text-[23px] font-medium text-foreground">
            Check your email
          </h1>
          <p className="mt-2 text-[15px] text-foreground leading-relaxed">
            We sent a verification link to<br />
            <span className="font-medium text-foreground">{email}</span>
          </p>
        </div>

        <div className="rounded-panel border border-border bg-white p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
          <p className="text-[14px] text-foreground leading-relaxed text-center">
            Click the link in your email to verify your account. If you don&apos;t see it, check your spam folder.
          </p>

          <div className="mt-5 flex flex-col gap-3">
            <button
              onClick={handleResend}
              disabled={resending}
              className="flex h-10 w-full items-center justify-center rounded-md border border-border bg-white text-[15px] font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-60 cursor-pointer"
            >
              {resending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                'Resend verification email'
              )}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-[14px] text-fg-secondary">
          <Link href="/login" className="inline-flex items-center gap-1 text-brand hover:text-brand-strong transition-colors">
            <ArrowLeft size={14} />
            Back to sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-105">
      {/* Logo / Branding */}
      <div className="mb-8 text-center flex flex-col items-center">
        <div className="mb-4 rounded-panel bg-brand px-3 py-2">
          <span className="text-[14px] font-bold text-white">Smart Chiro</span>
        </div>
        <h1 className="text-[23px] font-medium text-foreground">
          Create your account
        </h1>
        <p className="mt-1 text-[15px] text-fg-secondary">
          Get started with SmartChiro
        </p>
      </div>

      {/* Auth Card */}
      <div className="rounded-panel border border-border bg-white p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="mb-1.5 block text-[14px] font-medium text-foreground"
            >
              Full name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Jane Smith"
              className="h-10 w-full rounded-md border border-border bg-surface-muted px-3 text-[15px] text-foreground placeholder-fg-secondary transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

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
              className="h-10 w-full rounded-md border border-border bg-surface-muted px-3 text-[15px] text-foreground placeholder-fg-secondary transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-[14px] font-medium text-foreground"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="h-10 w-full rounded-md border border-border bg-surface-muted px-3 pr-10 text-[15px] text-foreground placeholder-fg-secondary transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-[14px] font-medium text-foreground"
            >
              Confirm password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="h-10 w-full rounded-md border border-border bg-surface-muted px-3 pr-10 text-[15px] text-foreground placeholder-fg-secondary transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-secondary hover:text-foreground cursor-pointer"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                aria-pressed={showConfirmPassword}
              >
                {showConfirmPassword ? (
                  <EyeOff size={16} strokeWidth={1.5} />
                ) : (
                  <Eye size={16} strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-[14px] text-danger">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-[15px] font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              'Create account'
            )}
          </button>
        </form>

        {/* Google Sign Up */}
        {googleEnabled && (
          <>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[13px] text-fg-secondary">or continue with</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <GoogleSignInButton label="Register using Google" />
          </>
        )}
      </div>

      {/* Footer */}
      <p className="mt-6 text-center text-[14px] text-fg-secondary">
        Already have an account?{' '}
        <Link href="/login" className="text-brand hover:text-brand-strong transition-colors">Sign in</Link>
      </p>
    </div>
  )
}
