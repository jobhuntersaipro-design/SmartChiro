import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

const TEST_PREFIX = `test-branch-val-${Date.now()}`
let userId: string

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/branches', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/branches — validation', () => {
  let POST: typeof import('../../branches/route').POST

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `${TEST_PREFIX}@test.com`, name: 'Dr. Validator' },
    })
    userId = user.id
  })

  afterAll(async () => {
    await prisma.branchMember.deleteMany({ where: { userId } })
    // clean branches created by this user
    const memberships = await prisma.branchMember.findMany({ where: { userId }, select: { branchId: true } })
    if (memberships.length > 0) {
      await prisma.branch.deleteMany({ where: { id: { in: memberships.map(m => m.branchId) } } })
    }
    await prisma.user.delete({ where: { id: userId } })
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: userId } })
    const mod = await import('../../branches/route')
    POST = mod.POST
  })

  // ─── Required field validation ───

  it('rejects empty clinic name', async () => {
    const res = await POST(createRequest({ name: '', phone: '+60123', email: 'a@b.com', address: '123', city: 'KL', state: 'WP', zip: '50000' }))
    expect(res.status).toBe(400)
  })

  it('rejects missing phone', async () => {
    const res = await POST(createRequest({ name: 'Clinic', phone: '', email: 'a@b.com', address: '123', city: 'KL', state: 'WP', zip: '50000' }))
    expect(res.status).toBe(400)
  })

  it('rejects invalid phone format (no digits)', async () => {
    const res = await POST(createRequest({ name: 'Clinic', phone: 'abcdef', email: 'a@b.com', address: '123', city: 'KL', state: 'WP', zip: '50000' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('phone')
  })

  it('rejects phone too short (less than 7 digits)', async () => {
    const res = await POST(createRequest({ name: 'Clinic', phone: '+6012', email: 'a@b.com', address: '123', city: 'KL', state: 'WP', zip: '50000' }))
    expect(res.status).toBe(400)
  })

  it('accepts valid phone with country code', async () => {
    const res = await POST(createRequest({ name: 'Clinic', phone: '+60 12-345 6789', email: 'a@b.com', address: '123', city: 'KL', state: 'WP', zip: '50000' }))
    expect(res.status).toBe(201)
    // Cleanup
    const data = await res.json()
    await prisma.branchMember.deleteMany({ where: { branchId: data.branch.id } })
    await prisma.branch.delete({ where: { id: data.branch.id } })
  })

  it('accepts valid phone without country code', async () => {
    const res = await POST(createRequest({ name: 'Clinic2', phone: '0123456789', email: 'b@b.com', address: '123', city: 'KL', state: 'WP', zip: '50000' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    await prisma.branchMember.deleteMany({ where: { branchId: data.branch.id } })
    await prisma.branch.delete({ where: { id: data.branch.id } })
  })

  it('rejects invalid billing phone format', async () => {
    const res = await POST(createRequest({
      name: 'Clinic', phone: '+60123456789', email: 'a@b.com',
      address: '123', city: 'KL', state: 'WP', zip: '50000',
      billingContactPhone: 'abc',
    }))
    expect(res.status).toBe(400)
  })

  it('rejects missing email', async () => {
    const res = await POST(createRequest({ name: 'Clinic', phone: '+60123', email: '', address: '123', city: 'KL', state: 'WP', zip: '50000' }))
    expect(res.status).toBe(400)
  })

  it('rejects invalid email format', async () => {
    const res = await POST(createRequest({ name: 'Clinic', phone: '+60123', email: 'not-email', address: '123', city: 'KL', state: 'WP', zip: '50000' }))
    expect(res.status).toBe(400)
  })

  it('rejects missing address', async () => {
    const res = await POST(createRequest({ name: 'Clinic', phone: '+60123', email: 'a@b.com', address: '', city: 'KL', state: 'WP', zip: '50000' }))
    expect(res.status).toBe(400)
  })

  it('rejects missing city', async () => {
    const res = await POST(createRequest({ name: 'Clinic', phone: '+60123', email: 'a@b.com', address: '123', city: '', state: 'WP', zip: '50000' }))
    expect(res.status).toBe(400)
  })

  it('rejects missing state', async () => {
    const res = await POST(createRequest({ name: 'Clinic', phone: '+60123', email: 'a@b.com', address: '123', city: 'KL', state: '', zip: '50000' }))
    expect(res.status).toBe(400)
  })

  it('rejects missing zip', async () => {
    const res = await POST(createRequest({ name: 'Clinic', phone: '+60123', email: 'a@b.com', address: '123', city: 'KL', state: 'WP', zip: '' }))
    expect(res.status).toBe(400)
  })

  it('rejects invalid billing email format', async () => {
    const res = await POST(createRequest({
      name: 'Clinic', phone: '+60123', email: 'a@b.com',
      address: '123', city: 'KL', state: 'WP', zip: '50000',
      billingContactEmail: 'bad-email',
    }))
    expect(res.status).toBe(400)
  })

  it('rejects invalid website URL', async () => {
    const res = await POST(createRequest({
      name: 'Clinic', phone: '+60123', email: 'a@b.com',
      address: '123', city: 'KL', state: 'WP', zip: '50000',
      website: 'not-a-url',
    }))
    expect(res.status).toBe(400)
  })

  it('rejects negative treatment rooms', async () => {
    const res = await POST(createRequest({
      name: 'Clinic', phone: '+60123', email: 'a@b.com',
      address: '123', city: 'KL', state: 'WP', zip: '50000',
      treatmentRooms: -1,
    }))
    expect(res.status).toBe(400)
  })

  // ─── Happy path ───

  it('creates clinic with all required fields and auto-sets ownerName from session user', async () => {
    const res = await POST(createRequest({
      name: `${TEST_PREFIX} Clinic`,
      phone: '+60123456789',
      email: 'clinic@test.com',
      address: '123 Jalan Test',
      city: 'Kuala Lumpur',
      state: 'WP',
      zip: '50000',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.branch.name).toBe(`${TEST_PREFIX} Clinic`)

    // ownerName should be auto-set from session user
    const dbBranch = await prisma.branch.findUnique({ where: { id: data.branch.id } })
    expect(dbBranch!.ownerName).toBe('Dr. Validator')

    // Cleanup
    await prisma.branchMember.deleteMany({ where: { branchId: data.branch.id } })
    await prisma.branch.delete({ where: { id: data.branch.id } })
  })

  it('accepts valid optional fields', async () => {
    const res = await POST(createRequest({
      name: `${TEST_PREFIX} Full`,
      phone: '+60123456789',
      email: 'full@test.com',
      address: '456 Jalan Full',
      city: 'Petaling Jaya',
      state: 'Selangor',
      zip: '47300',
      website: 'https://smartchiro.com',
      treatmentRooms: 4,
      operatingHours: '{"mon":{"open":"09:00","close":"18:00"},"tue":{"open":"09:00","close":"18:00"}}',
      billingContactName: 'Finance Dept',
      billingContactEmail: 'billing@test.com',
      billingContactPhone: '+60198765432',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()

    const dbBranch = await prisma.branch.findUnique({ where: { id: data.branch.id } })
    expect(dbBranch!.website).toBe('https://smartchiro.com')
    expect(dbBranch!.treatmentRooms).toBe(4)

    // Cleanup
    await prisma.branchMember.deleteMany({ where: { branchId: data.branch.id } })
    await prisma.branch.delete({ where: { id: data.branch.id } })
  })
})
