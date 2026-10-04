import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const send = vi.fn()
vi.mock('resend', () => ({ Resend: vi.fn(function Resend() { return { emails: { send } } }) }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const user = {
  email: 'Dr@Clinic.my',
  name: 'Dr <Lim>',
  trialEndsAt: new Date('2026-11-02T04:00:00Z'),
  createdAt: new Date('2026-10-04T02:30:00Z'),
}

describe('sendNewSignupAlert', () => {
  const saved = process.env.SUPER_ADMIN_EMAILS
  beforeEach(() => send.mockReset().mockResolvedValue({ error: null }))
  afterEach(() => { process.env.SUPER_ADMIN_EMAILS = saved })

  it('emails every super admin the new account, how they signed up, the trial end and the admin link', async () => {
    process.env.SUPER_ADMIN_EMAILS = ' Boss@SmartChiro.org , ops@smartchiro.org'
    const { sendNewSignupAlert } = await import('../email')
    await sendNewSignupAlert(user, 'google')
    expect(send).toHaveBeenCalledTimes(1)
    const msg = send.mock.calls[0][0]
    expect(msg.to).toEqual(['boss@smartchiro.org', 'ops@smartchiro.org'])
    expect(msg.subject).toBe('New SmartChiro sign-up: Dr <Lim> (Dr@Clinic.my)')
    expect(msg.text).toContain('Signed up with: Google')
    expect(msg.text).toContain('Account created: Sun, 4 Oct 2026, 10:30 AM (Malaysia time)')
    expect(msg.text).toContain('Trial ends: 2 Nov 2026')
    expect(msg.text).toContain('/dashboard/admin')
    expect(msg.html).toContain('Dr &lt;Lim&gt;')
    expect(msg.html).not.toContain('Dr <Lim>')
  })

  it('sends nothing when no super admin is set, or when the only one is the new user', async () => {
    const { sendNewSignupAlert } = await import('../email')
    process.env.SUPER_ADMIN_EMAILS = ''
    await sendNewSignupAlert(user, 'email')
    process.env.SUPER_ADMIN_EMAILS = 'dr@clinic.my'
    await sendNewSignupAlert(user, 'email')
    expect(send).not.toHaveBeenCalled()
  })

  it('throws when Resend reports an error, so callers can log it', async () => {
    process.env.SUPER_ADMIN_EMAILS = 'boss@smartchiro.org'
    send.mockResolvedValue({ error: { message: 'domain not verified' } })
    const { sendNewSignupAlert } = await import('../email')
    await expect(sendNewSignupAlert(user, 'email')).rejects.toThrow('domain not verified')
  })
})
