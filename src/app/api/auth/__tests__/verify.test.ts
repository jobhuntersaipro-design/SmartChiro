import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Prisma
const mockFindUniqueToken = vi.fn()
const mockDeleteToken = vi.fn()
const mockFindUniqueUser = vi.fn()
const mockUpdateUser = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    verificationToken: {
      findUnique: (...args: unknown[]) => mockFindUniqueToken(...args),
      delete: (...args: unknown[]) => mockDeleteToken(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockFindUniqueUser(...args),
      update: (...args: unknown[]) => mockUpdateUser(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}))

function createRequest(token?: string): NextRequest {
  const url = token
    ? `http://localhost:3000/api/auth/verify?token=${token}`
    : 'http://localhost:3000/api/auth/verify'
  return new NextRequest(url)
}

describe('GET /api/auth/verify', () => {
  let GET: typeof import('../verify/route').GET

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../verify/route')
    GET = mod.GET
  })

  it('redirects to invalid when no token provided', async () => {
    const res = await GET(createRequest())
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/verify-email?status=invalid')
  })

  it('redirects to invalid when token not found in DB', async () => {
    mockFindUniqueToken.mockResolvedValue(null)

    const res = await GET(createRequest('bad-token'))
    expect(res.headers.get('location')).toContain('/verify-email?status=invalid')
  })

  it('redirects to expired when token is past expiry', async () => {
    mockFindUniqueToken.mockResolvedValue({
      identifier: 'user@test.com',
      token: 'expired-token',
      expires: new Date(Date.now() - 1000), // 1 second ago
    })
    mockDeleteToken.mockResolvedValue({})

    const res = await GET(createRequest('expired-token'))
    expect(res.headers.get('location')).toContain('/verify-email?status=expired')
    expect(mockDeleteToken).toHaveBeenCalledWith({ where: { token: 'expired-token' } })
  })

  it('redirects to invalid when user not found', async () => {
    mockFindUniqueToken.mockResolvedValue({
      identifier: 'ghost@test.com',
      token: 'valid-token',
      expires: new Date(Date.now() + 86400000),
    })
    mockFindUniqueUser.mockResolvedValue(null)

    const res = await GET(createRequest('valid-token'))
    expect(res.headers.get('location')).toContain('/verify-email?status=invalid')
  })

  it('redirects to already-verified when user is already verified', async () => {
    mockFindUniqueToken.mockResolvedValue({
      identifier: 'user@test.com',
      token: 'valid-token',
      expires: new Date(Date.now() + 86400000),
    })
    mockFindUniqueUser.mockResolvedValue({
      email: 'user@test.com',
      emailVerified: new Date(),
    })
    mockDeleteToken.mockResolvedValue({})

    const res = await GET(createRequest('valid-token'))
    expect(res.headers.get('location')).toContain('/verify-email?status=already-verified')
  })

  it('verifies user and redirects to success', async () => {
    mockFindUniqueToken.mockResolvedValue({
      identifier: 'user@test.com',
      token: 'valid-token',
      expires: new Date(Date.now() + 86400000),
    })
    mockFindUniqueUser.mockResolvedValue({
      email: 'user@test.com',
      emailVerified: null,
    })
    mockTransaction.mockResolvedValue([])

    const res = await GET(createRequest('valid-token'))
    expect(res.headers.get('location')).toContain('/verify-email?status=success')
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })
})
