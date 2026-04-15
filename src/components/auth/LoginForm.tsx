'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { GoogleSignInButton } from './GoogleSignInButton'

export function LoginForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
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
    <div className="w-full max-w-[420px]">
      {/* Logo / Branding */}
      <div className="mb-8 text-center flex flex-col items-center">
        <div className="mb-4 rounded-[6px] bg-[#533afd] px-3 py-2">
          <span className="text-[14px] font-bold text-white">Smart Chiro</span>
        </div>
        <h1 className="text-[23px] font-light text-[#061b31]">
          Sign in to SmartChiro
        </h1>
        <p className="mt-1 text-[15px] text-[#64748d]">
          Enter your credentials to continue
        </p>
      </div>

      {/* Auth Card */}
      <div className="rounded-[6px] border border-[#e5edf5] bg-white p-6" style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}>
        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="Enter your password"
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

          {emailNotVerified && (
            <div className="rounded-[4px] border border-[#F5A623]/30 bg-[#FFF8ED] p-3">
              <p className="text-[14px] text-[#061b31] font-medium">Email not verified</p>
              <p className="mt-1 text-[13px] text-[#273951]">
                Please check your inbox and click the verification link.
              </p>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resending}
                className="mt-2 text-[13px] font-medium text-[#533afd] hover:text-[#4434d4] transition-colors cursor-pointer disabled:opacity-60"
              >
                {resending ? 'Sending...' : 'Resend verification email'}
              </button>
            </div>
          )}

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
              'Sign in'
            )}
          </button>
        </form>

        {/* Google Sign In */}
        {googleEnabled && (
          <>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#e5edf5]" />
              <span className="text-[13px] text-[#64748d]">or continue with</span>
              <div className="h-px flex-1 bg-[#e5edf5]" />
            </div>
            <GoogleSignInButton />
          </>
        )}
      </div>

      {/* Footer */}
      <p className="mt-6 text-center text-[14px] text-[#64748d]">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-[#533afd] hover:text-[#4434d4] transition-colors">Register Here</Link>
      </p>
    </div>
  )
}
