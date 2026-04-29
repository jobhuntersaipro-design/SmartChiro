import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Prisma — every call we observe gets its own vi.fn() so we can assert payloads
const mockTokenFindUnique = vi.fn()
const mockTokenDelete = vi.fn()
const mockUserFindUnique = vi.fn()
const mockUserUpdate = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    passwordResetToken: {
      findUnique: (...args: unknown[]) => mockTokenFindUnique(...args),
      // For the orphaned-user cleanup path AND the expired-token branch
      delete: (...args: unknown[]) => mockTokenDelete(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      // Captured for transaction-payload assertions; the route invokes this
      // synchronously inside the array passed to $transaction
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}))

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed_new_password'),
}))

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const validBody = { token: 'tok_valid', password: 'newSecret123' }

describe('POST /api/auth/reset-password', () => {
  let POST: typeof import('../reset-password/route').POST

  beforeEach(async () => {
    vi.clearAllMocks()
    // Sensible defaults; tests override per-case
    mockTransaction.mockResolvedValue([])
    mockTokenDelete.mockResolvedValue({})
    mockUserUpdate.mockReturnValue({ __op: 'user.update' })
    const mod = await import('../reset-password/route')
    POST = mod.POST
  })

  it('returns 400 invalid_token when token is missing from the body', async () => {
    const res = await POST(createRequest({ password: 'newSecret123' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('invalid_token')
  })

  it('returns 400 with validation error when password is shorter than 8 chars', async () => {
    const res = await POST(createRequest({ token: 'tok_valid', password: 'short' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Password must be at least 8 characters')
  })

  it('returns 400 invalid_token when the token row does not exist', async () => {
    mockTokenFindUnique.mockResolvedValue(null)

    const res = await POST(createRequest(validBody))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('invalid_token')
  })

  it('returns 400 expired_token and deletes the token when expired', async () => {
    mockTokenFindUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      token: 'tok_valid',
      expires: new Date(Date.now() - 1000),
    })
    mockTokenDelete.mockResolvedValue({})

    const res = await POST(createRequest(validBody))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('expired_token')
    expect(mockTokenDelete).toHaveBeenCalledWith({ where: { id: 'tok_1' } })
  })

  it('returns 400 invalid_token when the linked user no longer exists', async () => {
    mockTokenFindUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'ghost',
      token: 'tok_valid',
      expires: new Date(Date.now() + 60_000),
    })
    mockUserFindUnique.mockResolvedValue(null)

    const res = await POST(createRequest(validBody))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('invalid_token')
  })

  it('updates password, deletes token, and sets emailVerified when previously null', async () => {
    mockTokenFindUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      token: 'tok_valid',
      expires: new Date(Date.now() + 60_000),
    })
    mockUserFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      emailVerified: null,
      password: 'old_hash',
    })

    const res = await POST(createRequest(validBody))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ success: true })

    // The route invokes prisma.user.update(...) and prisma.passwordResetToken.delete(...)
    // synchronously inside the array passed to $transaction; we can inspect both.
    expect(mockUserUpdate).toHaveBeenCalledTimes(1)
    const userUpdateArg = mockUserUpdate.mock.calls[0][0] as {
      where: { id: string }
      data: { password: string; emailVerified?: Date }
    }
    expect(userUpdateArg.where).toEqual({ id: 'user_1' })
    expect(userUpdateArg.data.password).toBe('hashed_new_password')
    expect(userUpdateArg.data.emailVerified).toBeInstanceOf(Date)

    expect(mockTokenDelete).toHaveBeenCalledWith({ where: { id: 'tok_1' } })
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  it('updates password but does not overwrite an already-set emailVerified', async () => {
    const existingVerified = new Date('2024-01-01T00:00:00Z')
    mockTokenFindUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      token: 'tok_valid',
      expires: new Date(Date.now() + 60_000),
    })
    mockUserFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      emailVerified: existingVerified,
      password: 'old_hash',
    })

    const res = await POST(createRequest(validBody))
    expect(res.status).toBe(200)

    expect(mockUserUpdate).toHaveBeenCalledTimes(1)
    const userUpdateArg = mockUserUpdate.mock.calls[0][0] as {
      data: { password: string; emailVerified?: Date }
    }
    expect(userUpdateArg.data.password).toBe('hashed_new_password')
    // The key must NOT be present at all (not "set to existing value")
    expect('emailVerified' in userUpdateArg.data).toBe(false)
  })
})
