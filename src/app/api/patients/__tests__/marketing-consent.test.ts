import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { POST } from '../route'
import { PATCH } from '../[patientId]/route'

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

const TEST_PREFIX = `test-consent-${Date.now()}`

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
  POST(req('POST', '/api/patients', { firstName: 'Mc', lastName: 'Test', phone: '0123456789', ...body }))
const update = (id: string, body: Record<string, unknown>) =>
  PATCH(req('PATCH', `/api/patients/${id}`, body), { params: Promise.resolve({ patientId: id }) })

describe('patient marketing consent and Chinese language', () => {
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

  it('defaults to no consent and accepts zh', async () => {
    const res = await create({ preferredLanguage: 'zh' })
    expect(res.status).toBe(201)
    const p = await res.json()
    expect(p).toMatchObject({ preferredLanguage: 'zh', marketingConsent: false, marketingConsentAt: null })
  })

  it('rejects unknown languages', async () => {
    expect((await create({ preferredLanguage: 'fr' })).status).toBe(400)
  })

  it('stamps consent on create and keeps the original time when re-sent', async () => {
    const p = await (await create({ marketingConsent: true })).json()
    expect(p.marketingConsent).toBe(true)
    expect(p.marketingConsentAt).toEqual(expect.any(String))

    const again = await (await update(p.id, { marketingConsent: true })).json()
    expect(again.patient.marketingConsentAt).toBe(p.marketingConsentAt)
  })

  it('clears consent and its time on withdrawal; rejects non-boolean values', async () => {
    const p = await (await create({ marketingConsent: true })).json()
    const off = await (await update(p.id, { marketingConsent: false })).json()
    expect(off.patient).toMatchObject({ marketingConsent: false, marketingConsentAt: null })
    expect((await update(p.id, { marketingConsent: 'yes' })).status).toBe(400)
    const on = await (await update(p.id, { marketingConsent: true, preferredLanguage: 'zh' })).json()
    expect(on.patient).toMatchObject({ marketingConsent: true, preferredLanguage: 'zh' })
  })
})
