import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { resolveGoogleUser } from '../auth/google'

const PREFIX = `test-google-${Date.now()}`
const account = (id: string) => ({ type: 'oidc', provider: 'google', providerAccountId: `${PREFIX}-${id}` })

describe('resolveGoogleUser', () => {
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
  })

  it('signs the same Google account in again without duplicating anything', async () => {
    const first = await resolveGoogleUser({ email: `${PREFIX}-again@gmail.com` }, account('again'))
    const second = await resolveGoogleUser({ email: `${PREFIX}-again@gmail.com` }, account('again'))
    expect(second.id).toBe(first.id)
    expect(await prisma.account.count({ where: { userId: first.id } })).toBe(1)
    expect(await prisma.user.count({ where: { email: `${PREFIX}-again@gmail.com` } })).toBe(1)
  })

  it('verifies a never-verified account and drops the password whoever registered it set', async () => {
    const squatter = await prisma.user.create({
      data: { email: `${PREFIX}-owner@gmail.com`, password: 'hash-set-by-someone', emailVerified: null },
    })
    const user = await resolveGoogleUser({ email: `${PREFIX}-owner@gmail.com` }, account('owner'))
    expect(user.id).toBe(squatter.id)
    expect(user.emailVerified).not.toBeNull()
    expect(user.password).toBeNull()
  })

  it('links Google to a verified password account and keeps its password', async () => {
    const verified = await prisma.user.create({
      data: { email: `${PREFIX}-both@gmail.com`, password: 'real-hash', emailVerified: new Date() },
    })
    const user = await resolveGoogleUser({ email: `${PREFIX}-both@gmail.com` }, account('both'))
    expect(user.id).toBe(verified.id)
    expect(user.password).toBe('real-hash')
    expect(await prisma.account.count({ where: { userId: verified.id, provider: 'google' } })).toBe(1)
  })
})
