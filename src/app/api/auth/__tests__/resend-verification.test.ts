import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Prisma
const mockFindUnique = vi.fn()
const mockFindRecentToken = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    verificationToken: {
      findFirst: (...args: unknown[]) => mockFindRecentToken(...args),
    },
  },
}))

// Mock email
const mockSendVerificationEmail = vi.fn()

vi.mock('@/lib/email', () => ({
  sendVerificationEmail: (...args: unknown[]) => mockSendVerificationEmail(...args),
}))

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/auth/resend-verification', () => {
  let POST: typeof import('../resend-verification/route').POST

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../resend-verification/route')
    POST = mod.POST
  })

  it('returns 400 when email is missing', async () => {
    const res = await POST(createRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns success even when user does not exist (no leak)', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await POST(createRequest({ email: 'noone@test.com' }))
    expect(res.status).toBe(200)
    expect(mockSendVerificationEmail).not.toHaveBeenCalled()
  })

  it('returns success without sending when user is already verified', async () => {
    mockFindUnique.mockResolvedValue({
      email: 'user@test.com',
      name: 'Test',
      emailVerified: new Date(),
    })

    const res = await POST(createRequest({ email: 'user@test.com' }))
    expect(res.status).toBe(200)
    expect(mockSendVerificationEmail).not.toHaveBeenCalled()
  })

  it('sends verification email for unverified user', async () => {
    mockFindUnique.mockResolvedValue({
      email: 'user@test.com',
      name: 'Dr. Test',
      emailVerified: null,
    })
    mockSendVerificationEmail.mockResolvedValue(undefined)

    const res = await POST(createRequest({ email: 'user@test.com' }))
    expect(res.status).toBe(200)
    expect(mockSendVerificationEmail).toHaveBeenCalledWith('user@test.com', 'Dr. Test')
  })

  it('uses fallback name when user has no name', async () => {
    mockFindUnique.mockResolvedValue({
      email: 'user@test.com',
      name: null,
      emailVerified: null,
    })
    mockSendVerificationEmail.mockResolvedValue(undefined)

    await POST(createRequest({ email: 'user@test.com' }))
    expect(mockSendVerificationEmail).toHaveBeenCalledWith('user@test.com', 'there')
  })

  it('sends at most one email a minute per address', async () => {
    mockFindUnique.mockResolvedValue({ email: 'user@test.com', name: 'Dr. Test', emailVerified: null })
    mockFindRecentToken.mockResolvedValueOnce({ identifier: 'user@test.com' })

    const res = await POST(createRequest({ email: 'user@test.com' }))
    expect(res.status).toBe(200)
    expect(mockSendVerificationEmail).not.toHaveBeenCalled()
    const where = mockFindRecentToken.mock.calls[0][0].where
    expect(where.identifier).toBe('user@test.com')
    // made within the last minute = expires more than 24h − 60s from now
    expect(where.expires.gt.getTime()).toBeGreaterThan(Date.now() + 24 * 3600_000 - 61_000)
  })
})
