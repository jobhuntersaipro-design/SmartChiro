'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [linkState, setLinkState] = useState<'ok' | 'invalid' | 'expired'>('ok')

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
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (data.error === 'invalid_token') {
          setLinkState('invalid')
          setLoading(false)
          return
        }
        if (data.error === 'expired_token') {
          setLinkState('expired')
          setLoading(false)
          return
        }
        setError(data.error || 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      router.push('/login?reset=success')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (linkState !== 'ok') {
    const title = linkState === 'expired' ? 'This link has expired' : 'Invalid reset link'
    const body =
      linkState === 'expired'
        ? 'Your password reset link has expired. Request a new one to continue.'
        : 'This password reset link is invalid or has already been used.'

    return (
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center flex flex-col items-center">
          <div className="mb-4 rounded-[6px] bg-[#533afd] px-3 py-2">
            <span className="text-[14px] font-bold text-white">Smart Chiro</span>
          </div>
          <h1 className="text-[23px] font-light text-[#061b31]">{title}</h1>
          <p className="mt-2 text-[15px] text-[#273951]">{body}</p>
        </div>

        <Link
          href="/forgot-password"
          className="flex h-[40px] w-full items-center justify-center rounded-[4px] bg-[#533afd] text-[15px] font-medium text-white transition-colors hover:bg-[#4434d4]"
        >
          Request a new reset link
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-8 text-center flex flex-col items-center">
        <div className="mb-4 rounded-[6px] bg-[#533afd] px-3 py-2">
          <span className="text-[14px] font-bold text-white">Smart Chiro</span>
        </div>
        <h1 className="text-[23px] font-light text-[#061b31]">Set a new password</h1>
        <p className="mt-1 text-[15px] text-[#64748d]">Enter a new password for your account</p>
      </div>

      <div
        className="rounded-[6px] border border-[#e5edf5] bg-white p-6"
        style={{
          boxShadow:
            'rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px',
        }}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-[14px] font-medium text-[#061b31]"
            >
              New password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="h-[40px] w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 pr-10 text-[15px] text-[#061b31] placeholder-[#64748d] transition-colors focus:border-[#533afd] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
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
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="h-[40px] w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 pr-10 text-[15px] text-[#061b31] placeholder-[#64748d] transition-colors focus:border-[#533afd] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
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

          {error && <p className="text-[14px] text-[#DF1B41]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex h-[40px] w-full items-center justify-center rounded-[4px] bg-[#533afd] text-[15px] font-medium text-white transition-colors hover:bg-[#4434d4] disabled:opacity-60 cursor-pointer"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
