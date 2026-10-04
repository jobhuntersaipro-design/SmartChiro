import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { resolveGoogleUser } from '../auth/google'

const mockSendWelcome = vi.fn()
const mockSignupAlert = vi.fn()
vi.mock('@/lib/email', () => ({
  sendWelcomeEmail: (...args: unknown[]) => mockSendWelcome(...args),
  sendNewSignupAlert: (...args: unknown[]) => mockSignupAlert(...args),
}))

const PREFIX = `test-google-${Date.now()}`
const account = (id: string) => ({ type: 'oidc', provider: 'google', providerAccountId: `${PREFIX}-${id}` })

describe('resolveGoogleUser', () => {
  beforeEach(() => {
    mockSendWelcome.mockReset().mockResolvedValue(undefined)
    mockSignupAlert.mockReset().mockResolvedValue(undefined)
  })
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
  })

  it('signs up a new user, already verified and on the 30-day trial, with Google linked', async () => {
    const user = await resolveGoogleUser(
      { email: `${PREFIX}-New@Gmail.com`, name: 'Dr New', picture: 'https://lh3.example/p.png' },
      account('new'),
    )
    expect(user).toMatchObject({ email: `${PREFIX}-new@gmail.com`, name: 'Dr New', image: 'https://lh3.example/p.png' })
    expect(user.emailVerified).not.toBeNull()
    expect(user.password).toBeNull()
    expect((user.trialEndsAt!.getTime() - Date.now()) / 86_400_000).toBeCloseTo(30, 0)
    expect(await prisma.account.count({ where: { userId: user.id, provider: 'google' } })).toBe(1)
    expect(mockSendWelcome).toHaveBeenCalledTimes(1)
    expect(mockSendWelcome.mock.calls[0][0]).toMatchObject({ email: `${PREFIX}-new@gmail.com`, name: 'Dr New' })
    expect(mockSignupAlert).toHaveBeenCalledTimes(1)
    expect(mockSignupAlert.mock.calls[0]).toEqual([expect.objectContaining({ email: `${PREFIX}-new@gmail.com` }), 'google'])
  })

  it('signs up even when the welcome email fails', async () => {
    mockSendWelcome.mockRejectedValueOnce(new Error('Resend down'))
    mockSignupAlert.mockRejectedValueOnce(new Error('Resend down'))
    const user = await resolveGoogleUser({ email: `${PREFIX}-mailfail@gmail.com` }, account('mailfail'))
    expect(user.emailVerified).not.toBeNull()
  })

  it('signs the same Google account in again without duplicating anything', async () => {
    const first = await resolveGoogleUser({ email: `${PREFIX}-again@gmail.com` }, account('again'))
    const second = await resolveGoogleUser({ email: `${PREFIX}-again@gmail.com` }, account('again'))
    expect(second.id).toBe(first.id)
    expect(await prisma.account.count({ where: { userId: first.id } })).toBe(1)
    expect(await prisma.user.count({ where: { email: `${PREFIX}-again@gmail.com` } })).toBe(1)
    // Welcome and alert once, on the first sign-in only.
    expect(mockSendWelcome).toHaveBeenCalledTimes(1)
    expect(mockSignupAlert).toHaveBeenCalledTimes(1)
  })

  it('verifies a never-verified account and drops the password whoever registered it set', async () => {
    const squatter = await prisma.user.create({
      data: { email: `${PREFIX}-owner@gmail.com`, password: 'hash-set-by-someone', emailVerified: null },
    })
    const user = await resolveGoogleUser({ email: `${PREFIX}-owner@gmail.com` }, account('owner'))
    expect(user.id).toBe(squatter.id)
    expect(user.emailVerified).not.toBeNull()
    expect(user.password).toBeNull()
    expect(mockSendWelcome).toHaveBeenCalledTimes(1)
  })

  // G3: an owner created the account and typed its password; the real person
  // signing in with Google must not share the account with that password.
  it('drops a password someone else set when its owner first signs in with Google', async () => {
    const staff = await prisma.user.create({
      data: { email: `${PREFIX}-staff@gmail.com`, password: 'owner-typed', emailVerified: new Date(), passwordSetByOther: true },
    })
    const user = await resolveGoogleUser({ email: `${PREFIX}-staff@gmail.com` }, account('staff'))
    expect(user.id).toBe(staff.id)
    expect(user.password).toBeNull()
    expect(user.passwordSetByOther).toBe(false)
    expect(user.passwordChangedAt).not.toBeNull() // ends the owner's sessions on it
  })

  it('links Google to a verified password account and keeps its password', async () => {
    const verified = await prisma.user.create({
      data: { email: `${PREFIX}-both@gmail.com`, password: 'real-hash', emailVerified: new Date() },
    })
    const user = await resolveGoogleUser({ email: `${PREFIX}-both@gmail.com` }, account('both'))
    expect(user.id).toBe(verified.id)
    expect(user.password).toBe('real-hash')
    expect(await prisma.account.count({ where: { userId: verified.id, provider: 'google' } })).toBe(1)
    expect(mockSendWelcome).not.toHaveBeenCalled()
    expect(mockSignupAlert).not.toHaveBeenCalled()
  })
})
