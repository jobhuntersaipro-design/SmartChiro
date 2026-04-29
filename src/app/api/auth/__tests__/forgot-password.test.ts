import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Prisma
const mockUserFindUnique = vi.fn()
const mockTokenFindFirst = vi.fn()
const mockTokenDeleteMany = vi.fn()
const mockTokenCreate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    passwordResetToken: {
      findFirst: (...args: unknown[]) => mockTokenFindFirst(...args),
      deleteMany: (...args: unknown[]) => mockTokenDeleteMany(...args),
      create: (...args: unknown[]) => mockTokenCreate(...args),
    },
  },
}))

// Mock email
const mockCreatePasswordResetToken = vi.fn()
const mockSendPasswordResetEmail = vi.fn()

vi.mock('@/lib/email', () => ({
  createPasswordResetToken: (...args: unknown[]) => mockCreatePasswordResetToken(...args),
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
}))

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/auth/forgot-password', () => {
  let POST: typeof import('../forgot-password/route').POST

  beforeEach(async () => {
    vi.clearAllMocks()
    mockTokenFindFirst.mockResolvedValue(null)
    mockCreatePasswordResetToken.mockResolvedValue('generated_token_abc')
    mockSendPasswordResetEmail.mockResolvedValue(undefined)
    const mod = await import('../forgot-password/route')
    POST = mod.POST
  })

  it('returns 200 success when email does not exist (no token created, no email sent)', async () => {
    mockUserFindUnique.mockResolvedValue(null)

    const res = await POST(createRequest({ email: 'unknown@example.com' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ success: true })

    expect(mockCreatePasswordResetToken).not.toHaveBeenCalled()
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled()
  })

  it('returns 200 and sends a reset email when the user exists', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      name: 'Test User',
    })

    const res = await POST(createRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(200)

    expect(mockCreatePasswordResetToken).toHaveBeenCalledWith('user_1')
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
      'user@example.com',
      'Test User',
      'generated_token_abc'
    )
  })

  it('lowercases and trims the email before user lookup', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      name: 'Test User',
    })

    await POST(createRequest({ email: '   USER@Example.COM   ' }))

    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    })
  })

  it('throttles when an existing token was created within the last 60 seconds', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      name: 'Test User',
    })
    // Token created 30 seconds ago
    mockTokenFindFirst.mockResolvedValue({
      id: 'tok_1',
      createdAt: new Date(Date.now() - 30_000),
    })

    const res = await POST(createRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ success: true })

    expect(mockCreatePasswordResetToken).not.toHaveBeenCalled()
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled()
  })

  it('does not throttle when no token exists within the 60-second window', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      name: 'Test User',
    })
    // Real Prisma's `findFirst({ where: { createdAt: { gt: ... } } })` returns
    // null when the latest token is outside the 60s window — the DB filter
    // excludes it. Mock that semantic rather than returning a stale row.
    mockTokenFindFirst.mockResolvedValue(null)

    const res = await POST(createRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(200)

    expect(mockCreatePasswordResetToken).toHaveBeenCalledWith('user_1')
    expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(1)
  })

  it('still returns 200 success when the email send throws', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      name: 'Test User',
    })
    mockSendPasswordResetEmail.mockRejectedValue(new Error('Resend down'))

    const res = await POST(createRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ success: true })
  })

  it('returns 400 when email is missing or malformed', async () => {
    const res = await POST(createRequest({}))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeDefined()
  })
})
