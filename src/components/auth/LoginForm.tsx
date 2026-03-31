'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { RoleSelector } from './RoleSelector'
import { GoogleSignInButton } from './GoogleSignInButton'

export function LoginForm() {
  const router = useRouter()
  const [loginRole, setLoginRole] = useState<'owner' | 'staff'>('owner')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('credentials', {
      email,
      password,
      loginRole,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      if (loginRole === 'owner') {
        setError('Invalid credentials or no clinic found for this owner account.')
      } else {
        setError('Invalid credentials or you are not assigned to any clinic.')
      }
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="w-full max-w-[420px]">
      {/* Logo / Branding */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[6px] bg-[#635BFF]">
          <span className="text-[20px] font-bold text-white">S</span>
        </div>
        <h1 className="text-[23px] font-semibold text-[#0A2540]">
          Sign in to SmartChiro
        </h1>
        <p className="mt-1 text-[15px] text-[#697386]">
          Select your role and enter your credentials
        </p>
      </div>

      {/* Auth Card */}
      <div className="rounded-[6px] border border-[#E3E8EE] bg-white p-6 shadow-[var(--shadow-card)]">
        {/* Role Selector */}
        <div className="mb-5">
          <label className="mb-2 block text-[14px] font-medium text-[#0A2540]">
            Sign in as
          </label>
          <RoleSelector value={loginRole} onChange={setLoginRole} />
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-[14px] font-medium text-[#0A2540]"
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
              className="h-[40px] w-full rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] px-3 text-[15px] text-[#0A2540] placeholder-[#697386] transition-colors focus:border-[#635BFF] focus:outline-none focus:ring-1 focus:ring-[#635BFF]"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-[14px] font-medium text-[#0A2540]"
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
                className="h-[40px] w-full rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] px-3 pr-10 text-[15px] text-[#0A2540] placeholder-[#697386] transition-colors focus:border-[#635BFF] focus:outline-none focus:ring-1 focus:ring-[#635BFF]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#697386] hover:text-[#0A2540] cursor-pointer"
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

          {error && (
            <p className="text-[14px] text-[#DF1B41]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-[40px] w-full items-center justify-center rounded-[4px] bg-[#635BFF] text-[15px] font-medium text-white transition-colors hover:bg-[#5851EB] disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#E3E8EE]" />
          <span className="text-[13px] text-[#697386]">or continue with</span>
          <div className="h-px flex-1 bg-[#E3E8EE]" />
        </div>

        {/* Google Sign In */}
        <GoogleSignInButton />
      </div>

      {/* Footer */}
      <p className="mt-6 text-center text-[14px] text-[#697386]">
        Don&apos;t have an account?{' '}
        <span className="text-[#635BFF]">Contact your clinic admin</span>
      </p>
    </div>
  )
}
