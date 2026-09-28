import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { POST } from '../route'
import { PATCH } from '../[patientId]/route'

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

const TEST_PREFIX = `test-rc-${Date.now()}`

let ownerId: string
let branchId: string

function req(method: string, url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const create = (body: Record<string, unknown>) =>
  POST(req('POST', '/api/patients', { firstName: 'Rc', lastName: 'Test', ...body }))
const update = (id: string, body: Record<string, unknown>) =>
  PATCH(req('PATCH', `/api/patients/${id}`, body), { params: Promise.resolve({ patientId: id }) })

describe('patient reminder channel needs a matching contact', () => {
  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `${TEST_PREFIX}-owner@t.com`, name: 'Owner' } })
    ownerId = owner.id
    const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX} Branch` } })
    branchId = branch.id
    await prisma.branchMember.create({ data: { userId: ownerId, branchId, role: 'OWNER' } })
    await prisma.user.update({ where: { id: ownerId }, data: { activeBranchId: branchId } })
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
  })

  afterAll(async () => {
    await prisma.patient.deleteMany({ where: { branchId } })
    await prisma.branchMember.deleteMany({ where: { branchId } })
    await prisma.branch.deleteMany({ where: { id: branchId } })
    await prisma.user.deleteMany({ where: { id: ownerId } })
  })

  describe('POST', () => {
    it('defaults the channel from the contact details entered', async () => {
      const phoneOnly = await (await create({ phone: '012-345 6789' })).json()
      expect(phoneOnly.reminderChannel).toBe('WHATSAPP')
      const emailOnly = await (await create({ email: `${TEST_PREFIX}-e1@t.com` })).json()
      expect(emailOnly.reminderChannel).toBe('EMAIL')
      const neither = await (await create({})).json()
      expect(neither.reminderChannel).toBe('NONE')
    })

    it('rejects WhatsApp without a phone number', async () => {
      const res = await create({ email: `${TEST_PREFIX}-e2@t.com`, reminderChannel: 'WHATSAPP' })
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.code).toBe('reminder_channel_contact')
      expect(body.error).toMatch(/phone number/)
    })

    it('rejects email without an email address', async () => {
      const res = await create({ phone: '0123456789', reminderChannel: 'EMAIL' })
      expect(res.status).toBe(422)
      expect((await res.json()).error).toMatch(/email address/)
    })

    it('rejects BOTH unless both contacts are present', async () => {
      expect((await create({ phone: '0123456789', reminderChannel: 'BOTH' })).status).toBe(422)
      const ok = await create({ phone: '0123456789', email: `${TEST_PREFIX}-e3@t.com`, reminderChannel: 'BOTH' })
      expect(ok.status).toBe(201)
      expect((await ok.json()).reminderChannel).toBe('BOTH')
    })
  })

  describe('PATCH (judged on the merged record)', () => {
    it('blocks removing the phone of a WhatsApp patient', async () => {
      const p = await prisma.patient.create({
        data: { firstName: 'A', lastName: 'B', phone: '0123456789', reminderChannel: 'WHATSAPP', branchId, doctorId: ownerId },
      })
      const res = await update(p.id, { phone: '' })
      expect(res.status).toBe(422)
      expect((await res.json()).code).toBe('reminder_channel_contact')
    })

    it('blocks switching to email when the stored record has no email', async () => {
      const p = await prisma.patient.create({
        data: { firstName: 'A', lastName: 'C', phone: '0123456789', reminderChannel: 'WHATSAPP', branchId, doctorId: ownerId },
      })
      expect((await update(p.id, { reminderChannel: 'EMAIL' })).status).toBe(422)
      const ok = await update(p.id, { reminderChannel: 'EMAIL', email: `${TEST_PREFIX}-e4@t.com` })
      expect(ok.status).toBe(200)
    })

    it('leaves unrelated edits alone even when legacy data mismatches', async () => {
      const p = await prisma.patient.create({
        data: { firstName: 'A', lastName: 'D', reminderChannel: 'WHATSAPP', branchId, doctorId: ownerId },
      })
      expect((await update(p.id, { occupation: 'Teacher' })).status).toBe(200)
      expect((await update(p.id, { reminderChannel: 'NONE' })).status).toBe(200)
    })
  })
})
