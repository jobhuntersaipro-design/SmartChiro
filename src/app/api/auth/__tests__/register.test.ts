import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Prisma
const mockFindUnique = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}))

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed_password_123'),
}))

// Mock email
const mockSendVerificationEmail = vi.fn()

vi.mock('@/lib/email', () => ({
  sendVerificationEmail: (...args: unknown[]) => mockSendVerificationEmail(...args),
}))

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const validBody = {
  name: 'Dr. Test',
  email: 'test@example.com',
  password: 'password123',
  confirmPassword: 'password123',
}

describe('POST /api/auth/register', () => {
  let POST: typeof import('../register/route').POST

  beforeEach(async () => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ id: 'user_1', email: 'test@example.com' })
    mockSendVerificationEmail.mockResolvedValue(undefined)
    const mod = await import('../register/route')
    POST = mod.POST
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(createRequest({ email: 'a@b.com', password: '12345678', confirmPassword: '12345678' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('All fields are required')
  })

  it('returns 400 when email is missing', async () => {
    const res = await POST(createRequest({ name: 'Test', password: '12345678', confirmPassword: '12345678' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when password is missing', async () => {
    const res = await POST(createRequest({ name: 'Test', email: 'a@b.com', confirmPassword: '12345678' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when passwords do not match', async () => {
    const res = await POST(createRequest({
      name: 'Test',
      email: 'a@b.com',
      password: 'password123',
      confirmPassword: 'different456',
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Passwords do not match')
  })

  it('returns 400 when password is too short', async () => {
    const res = await POST(createRequest({
      name: 'Test',
      email: 'a@b.com',
      password: '1234567',
      confirmPassword: '1234567',
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Password must be at least 8 characters')
  })

  // Existing and new emails get the same response so the endpoint can't be
  // used to discover which emails have accounts.
  it('answers a verified email exactly like a new one, without touching the account', async () => {
    mockFindUnique.mockResolvedValue({ id: 'existing', emailVerified: new Date() })

    const res = await POST(createRequest(validBody))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.message).toContain('verification email')
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockSendVerificationEmail).not.toHaveBeenCalled()
  })

  // G1: someone registered the address first; the inbox owner registering now
  // must not verify into the first person's password.
  it('an unverified email takes the new password and name, and gets a fresh link', async () => {
    mockFindUnique.mockResolvedValue({ id: 'squatter', emailVerified: null })

    const res = await POST(createRequest(validBody))
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'squatter' },
      data: { name: 'Dr. Test', password: 'hashed_password_123' },
    })
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockSendVerificationEmail).toHaveBeenCalledWith('test@example.com', 'Dr. Test')
  })

  it('creates user with lowercased email and hashed password', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await POST(createRequest({ ...validBody, email: 'Test@Example.COM' }))
    expect(res.status).toBe(200)
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        name: 'Dr. Test',
        email: 'test@example.com',
        password: 'hashed_password_123',
      },
    })
  })

  it('sends verification email after registration', async () => {
    mockFindUnique.mockResolvedValue(null)

    await POST(createRequest(validBody))
    expect(mockSendVerificationEmail).toHaveBeenCalledWith('test@example.com', 'Dr. Test')
  })

  it('still succeeds if the verification email fails', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockSendVerificationEmail.mockRejectedValue(new Error('SMTP down'))

    const res = await POST(createRequest(validBody))
    expect(res.status).toBe(200)
    expect(mockCreate).toHaveBeenCalled()
  })

  it('returns 200 with the verification message on valid registration', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await POST(createRequest(validBody))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.message).toContain('verification email has been sent')
  })
})
