'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        // Only schema/validation errors land here (the route otherwise always returns 200)
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      setLoading(false)
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-105">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-panel bg-success">
            <CheckCircle2 size={24} className="text-white" />
          </div>
          <h1 className="text-[23px] font-light text-foreground">
            Check your email
          </h1>
          <p className="mt-2 text-[15px] text-foreground leading-relaxed">
            If an account exists with{' '}
            <span className="font-medium text-foreground">{email}</span>, we&apos;ve sent a reset link.
            <br />
            The link expires in 1 hour.
          </p>
        </div>

        <p className="mt-6 text-center text-[14px] text-fg-secondary">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-brand hover:text-brand-strong transition-colors"
          >
            <ArrowLeft size={14} />
            Back to sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-105">
      <div className="mb-8 text-center flex flex-col items-center">
        <div className="mb-4 rounded-panel bg-brand px-3 py-2">
          <span className="text-[14px] font-bold text-white">Smart Chiro</span>
        </div>
        <h1 className="text-[23px] font-light text-foreground">
          Reset your password
        </h1>
        <p className="mt-1 text-[15px] text-fg-secondary">
          Enter the email associated with your account
        </p>
      </div>

      <div
        className="rounded-panel border border-border bg-white p-6"
        style={{
          boxShadow:
            'rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px',
        }}
      >
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
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-10 w-full rounded-md border border-border bg-surface-muted px-3 text-[15px] text-foreground placeholder-fg-secondary transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {error && <p className="text-[14px] text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-[15px] font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send reset link'}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-[14px] text-fg-secondary">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-brand hover:text-brand-strong transition-colors"
        >
          <ArrowLeft size={14} />
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
