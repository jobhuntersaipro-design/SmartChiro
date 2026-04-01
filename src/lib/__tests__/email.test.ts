import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Prisma
const mockDeleteMany = vi.fn()
const mockCreate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    verificationToken: {
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}))

// Mock Resend
const mockSend = vi.fn().mockResolvedValue({ data: { id: 'test-email-id' }, error: null })

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockSend }
  },
}))

// Stub env
vi.stubEnv('RESEND_API_KEY', 'test-resend-key')
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.smartchiro.org')

describe('createVerificationToken', () => {
  let createVerificationToken: typeof import('../email').createVerificationToken

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../email')
    createVerificationToken = mod.createVerificationToken
  })

  it('deletes existing tokens for the same email', async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 })
    mockCreate.mockResolvedValue({})

    await createVerificationToken('test@example.com')

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { identifier: 'test@example.com' },
    })
  })

  it('creates a new token with expiry', async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 })
    mockCreate.mockResolvedValue({})

    const before = Date.now()
    await createVerificationToken('test@example.com')
    const after = Date.now()

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const createArgs = mockCreate.mock.calls[0][0]
    expect(createArgs.data.identifier).toBe('test@example.com')
    expect(createArgs.data.token).toHaveLength(64) // 32 bytes hex
    // Expires ~24 hours from now
    const expiresMs = new Date(createArgs.data.expires).getTime()
    const expectedMin = before + 24 * 60 * 60 * 1000 - 1000
    const expectedMax = after + 24 * 60 * 60 * 1000 + 1000
    expect(expiresMs).toBeGreaterThanOrEqual(expectedMin)
    expect(expiresMs).toBeLessThanOrEqual(expectedMax)
  })

  it('returns the token string', async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 })
    mockCreate.mockResolvedValue({})

    const token = await createVerificationToken('test@example.com')

    expect(typeof token).toBe('string')
    expect(token).toHaveLength(64)
  })
})

describe('sendVerificationEmail', () => {
  let sendVerificationEmail: typeof import('../email').sendVerificationEmail

  beforeEach(async () => {
    vi.clearAllMocks()
    mockDeleteMany.mockResolvedValue({ count: 0 })
    mockCreate.mockResolvedValue({})
    mockSend.mockResolvedValue({ data: { id: 'test-id' }, error: null })
    const mod = await import('../email')
    sendVerificationEmail = mod.sendVerificationEmail
  })

  it('sends email via Resend with correct parameters', async () => {
    await sendVerificationEmail('user@test.com', 'Dr. Smith')

    expect(mockSend).toHaveBeenCalledTimes(1)
    const sendArgs = mockSend.mock.calls[0][0]
    expect(sendArgs.to).toBe('user@test.com')
    expect(sendArgs.subject).toBe('Verify your SmartChiro account')
    expect(sendArgs.from).toContain('SmartChiro')
  })

  it('includes verification URL with token in email body', async () => {
    await sendVerificationEmail('user@test.com', 'Dr. Smith')

    const sendArgs = mockSend.mock.calls[0][0]
    expect(sendArgs.html).toContain('https://app.smartchiro.org/api/auth/verify?token=')
  })

  it('includes user name in email body', async () => {
    await sendVerificationEmail('user@test.com', 'Dr. Smith')

    const sendArgs = mockSend.mock.calls[0][0]
    expect(sendArgs.html).toContain('Dr. Smith')
  })

  it('throws if Resend returns an error', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'Rate limited' } })

    await expect(sendVerificationEmail('user@test.com', 'Test')).rejects.toThrow(
      'Failed to send verification email'
    )
  })
})
