import { describe, it, expect, vi, beforeEach } from 'vitest'

const send = vi.fn()
vi.mock('resend', () => ({ Resend: vi.fn(function Resend() { return { emails: { send } } }) }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

describe('sendWelcomeEmail', () => {
  beforeEach(() => send.mockReset().mockResolvedValue({ error: null }))

  it('welcomes the user by name with the trial end date, steps, a dashboard link and the prices', async () => {
    const { sendWelcomeEmail } = await import('../email')
    await sendWelcomeEmail({ email: 'dr@clinic.my', name: 'Dr <Lim>', trialEndsAt: new Date('2026-11-02T04:00:00Z') })
    expect(send).toHaveBeenCalledTimes(1)
    const msg = send.mock.calls[0][0]
    expect(msg).toMatchObject({ from: 'SmartChiro <noreply@smartchiro.org>', to: 'dr@clinic.my', subject: 'Welcome to SmartChiro' })
    expect(msg.text).toContain('Hi Dr <Lim>,')
    expect(msg.text).toContain('every feature is yours until 2 Nov 2026')
    expect(msg.text).toContain('1. Set up your clinic')
    expect(msg.text).toContain('/dashboard')
    expect(msg.text).toContain('RM 550 a month or RM 6,000 a year')
    expect(msg.html).toContain('Dr &lt;Lim&gt;')
    expect(msg.html).not.toContain('Dr <Lim>')
  })

  it('throws when Resend reports an error, so callers can log it', async () => {
    send.mockResolvedValue({ error: { message: 'domain not verified' } })
    const { sendWelcomeEmail } = await import('../email')
    await expect(sendWelcomeEmail({ email: 'a@b.my', name: null, trialEndsAt: null })).rejects.toThrow('domain not verified')
  })
})
