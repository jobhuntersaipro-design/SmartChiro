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
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[6px] bg-[#533afd]">
            <Mail size={24} className="text-white" />
          </div>
          <h1 className="text-[23px] font-light text-[#061b31]">
            Check your email
          </h1>
          <p className="mt-2 text-[15px] text-[#273951] leading-relaxed">
            We sent a verification link to<br />
            <span className="font-medium text-[#061b31]">{email}</span>
          </p>
        </div>

        <div className="rounded-[6px] border border-[#e5edf5] bg-white p-6" style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}>
          <p className="text-[14px] text-[#273951] leading-relaxed text-center">
            Click the link in your email to verify your account. If you don&apos;t see it, check your spam folder.
          </p>

          <div className="mt-5 flex flex-col gap-3">
            <button
              onClick={handleResend}
              disabled={resending}
              className="flex h-[40px] w-full items-center justify-center rounded-[4px] border border-[#e5edf5] bg-white text-[15px] font-medium text-[#061b31] transition-colors hover:bg-[#f6f9fc] disabled:opacity-60 cursor-pointer"
            >
              {resending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                'Resend verification email'
              )}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-[14px] text-[#64748d]">
          <Link href="/login" className="inline-flex items-center gap-1 text-[#533afd] hover:text-[#4434d4] transition-colors">
            <ArrowLeft size={14} />
            Back to sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[420px]">
      {/* Logo / Branding */}
      <div className="mb-8 text-center flex flex-col items-center">
        <div className="mb-4 rounded-[6px] bg-[#533afd] px-3 py-2">
          <span className="text-[14px] font-bold text-white">Smart Chiro</span>
        </div>
        <h1 className="text-[23px] font-light text-[#061b31]">
          Create your account
        </h1>
        <p className="mt-1 text-[15px] text-[#64748d]">
          Get started with SmartChiro
        </p>
      </div>

      {/* Auth Card */}
      <div className="rounded-[6px] border border-[#e5edf5] bg-white p-6" style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}>
        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="mb-1.5 block text-[14px] font-medium text-[#061b31]"
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
              className="h-[40px] w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[15px] text-[#061b31] placeholder-[#64748d] transition-colors focus:border-[#533afd] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-[14px] font-medium text-[#061b31]"
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
              className="h-[40px] w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[15px] text-[#061b31] placeholder-[#64748d] transition-colors focus:border-[#533afd] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-[14px] font-medium text-[#061b31]"
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
                className="h-[40px] w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 pr-10 text-[15px] text-[#061b31] placeholder-[#64748d] transition-colors focus:border-[#533afd] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748d] hover:text-[#061b31] cursor-pointer"
                tabIndex={-1}
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
              className="mb-1.5 block text-[14px] font-medium text-[#061b31]"
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
                className="h-[40px] w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 pr-10 text-[15px] text-[#061b31] placeholder-[#64748d] transition-colors focus:border-[#533afd] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748d] hover:text-[#061b31] cursor-pointer"
                tabIndex={-1}
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
            <p className="text-[14px] text-[#DF1B41]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-[40px] w-full items-center justify-center rounded-[4px] bg-[#533afd] text-[15px] font-medium text-white transition-colors hover:bg-[#4434d4] disabled:opacity-60 cursor-pointer"
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
              <div className="h-px flex-1 bg-[#e5edf5]" />
              <span className="text-[13px] text-[#64748d]">or continue with</span>
              <div className="h-px flex-1 bg-[#e5edf5]" />
            </div>
            <GoogleSignInButton label="Register using Google" />
          </>
        )}
      </div>

      {/* Footer */}
      <p className="mt-6 text-center text-[14px] text-[#64748d]">
        Already have an account?{' '}
        <Link href="/login" className="text-[#533afd] hover:text-[#4434d4] transition-colors">Sign in</Link>
      </p>
    </div>
  )
}
