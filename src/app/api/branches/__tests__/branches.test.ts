import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// Mock auth
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

const TEST_PREFIX = `test-branches-${Date.now()}`

// Test data IDs — populated in beforeAll
let ownerId: string
let adminId: string
let doctorId: string
let outsiderId: string
let branch1Id: string
let branch2Id: string

function createRequest(method: string, url: string, body?: Record<string, unknown>): NextRequest {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) init.body = JSON.stringify(body)
  return new NextRequest(`http://localhost:3000${url}`, init)
}

describe('Branch CRUD', () => {
  beforeAll(async () => {
    // Create test users
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-owner@test.com`, name: 'Test Owner' },
    })
    const admin = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-admin@test.com`, name: 'Test Admin' },
    })
    const doctor = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-doctor@test.com`, name: 'Test Doctor' },
    })
    const outsider = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-outsider@test.com`, name: 'Test Outsider' },
    })

    ownerId = owner.id
    adminId = admin.id
    doctorId = doctor.id
    outsiderId = outsider.id

    // Create two branches
    const b1 = await prisma.branch.create({ data: { name: `${TEST_PREFIX} Branch 1` } })
    const b2 = await prisma.branch.create({ data: { name: `${TEST_PREFIX} Branch 2` } })
    branch1Id = b1.id
    branch2Id = b2.id

    // Add members
    await prisma.branchMember.create({ data: { userId: ownerId, branchId: branch1Id, role: 'OWNER' } })
    await prisma.branchMember.create({ data: { userId: adminId, branchId: branch1Id, role: 'ADMIN' } })
    await prisma.branchMember.create({ data: { userId: doctorId, branchId: branch1Id, role: 'DOCTOR' } })
    await prisma.branchMember.create({ data: { userId: ownerId, branchId: branch2Id, role: 'OWNER' } })

    // Set active branch
    await prisma.user.update({ where: { id: ownerId }, data: { activeBranchId: branch1Id } })

    // Create a patient in branch1 for count testing
    await prisma.patient.create({
      data: {
        firstName: 'Test',
        lastName: 'Patient',
        branchId: branch1Id,
        doctorId: doctorId,
      },
    })
  })

  afterAll(async () => {
    // Clean up — delete users cascades everything
    await prisma.patient.deleteMany({ where: { branchId: { in: [branch1Id, branch2Id] } } })
    await prisma.branchMember.deleteMany({ where: { branchId: { in: [branch1Id, branch2Id] } } })
    await prisma.branchAuditLog.deleteMany({
      where: { OR: [{ branchId: { in: [branch1Id, branch2Id] } }, { actorId: { in: [ownerId, adminId, doctorId, outsiderId] } }] },
    })
    await prisma.branch.deleteMany({ where: { id: { in: [branch1Id, branch2Id] } } })
    // Also clean up any branches created during tests
    await prisma.branchMember.deleteMany({
      where: { userId: { in: [ownerId, adminId, doctorId, outsiderId] } },
    })
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, adminId, doctorId, outsiderId] } },
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── GET /api/branches ───

  describe('GET /api/branches', () => {
    let GET: typeof import('../../branches/route').GET

    beforeEach(async () => {
      const mod = await import('../../branches/route')
      GET = mod.GET
    })

    it('returns 401 for unauthenticated request', async () => {
      mockAuth.mockResolvedValue(null)
      const res = await GET(createRequest('GET', '/api/branches'))
      expect(res.status).toBe(401)
    })

    it('returns all branches user is a member of', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(createRequest('GET', '/api/branches'))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.branches.length).toBeGreaterThanOrEqual(2)
      const names = data.branches.map((b: { name: string }) => b.name)
      expect(names).toContain(`${TEST_PREFIX} Branch 1`)
      expect(names).toContain(`${TEST_PREFIX} Branch 2`)
    })

    it('includes member count and patient count', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(createRequest('GET', '/api/branches'))
      const data = await res.json()
      const b1 = data.branches.find((b: { id: string }) => b.id === branch1Id)
      expect(b1.memberCount).toBe(3)
      expect(b1.patientCount).toBe(1)
    })

    it('includes the caller role in each branch', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await GET(createRequest('GET', '/api/branches'))
      const data = await res.json()
      const b1 = data.branches.find((b: { id: string }) => b.id === branch1Id)
      expect(b1.userRole).toBe('DOCTOR')
    })

    it('does not return branches user is not a member of', async () => {
      mockAuth.mockResolvedValue({ user: { id: outsiderId } })
      const res = await GET(createRequest('GET', '/api/branches'))
      const data = await res.json()
      expect(data.branches).toHaveLength(0)
    })
  })

  // ─── POST /api/branches ───

  describe('POST /api/branches', () => {
    let POST: typeof import('../../branches/route').POST

    beforeEach(async () => {
      const mod = await import('../../branches/route')
      POST = mod.POST
    })

    it('returns 401 for unauthenticated request', async () => {
      mockAuth.mockResolvedValue(null)
      const res = await POST(createRequest('POST', '/api/branches', { name: 'New Branch' }))
      expect(res.status).toBe(401)
    })

    it('returns 400 for empty name', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await POST(createRequest('POST', '/api/branches', { name: '  ' }))
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid email format', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await POST(createRequest('POST', '/api/branches', {
        name: 'Valid Name',
        email: 'not-an-email',
      }))
      expect(res.status).toBe(400)
    })

    it('creates branch and sets user as OWNER', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId, email: `${TEST_PREFIX}-owner@test.com`, name: 'Test Owner' } })
      const branchName = `${TEST_PREFIX} Created Branch`
      const res = await POST(createRequest('POST', '/api/branches', {
        name: branchName,
        phone: '+60123456789',
        email: 'test@branch.com',
        address: '123 Test St',
        city: 'KL',
        state: 'WP',
        zip: '50000',
      }))
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.branch.name).toBe(branchName)

      // Verify in Neon DB
      const dbBranch = await prisma.branch.findUnique({ where: { id: data.branch.id } })
      expect(dbBranch).not.toBeNull()
      expect(dbBranch!.name).toBe(branchName)

      const membership = await prisma.branchMember.findUnique({
        where: { userId_branchId: { userId: ownerId, branchId: data.branch.id } },
      })
      expect(membership).not.toBeNull()
      expect(membership!.role).toBe('OWNER')

      // Cleanup
      await prisma.branchAuditLog.deleteMany({ where: { branchId: data.branch.id } })
      await prisma.branchMember.deleteMany({ where: { branchId: data.branch.id } })
      await prisma.branch.delete({ where: { id: data.branch.id } })
    })

    it('writes a CREATE audit-log row capturing the actor and post-image', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId, email: `${TEST_PREFIX}-owner@test.com`, name: 'Test Owner' } })
      const branchName = `${TEST_PREFIX} Audit-Trail Branch`
      const res = await POST(createRequest('POST', '/api/branches', {
        name: branchName,
        phone: '+60123456789',
        email: 'audit@branch.com',
        address: '99 Audit Lane',
        city: 'KL',
        state: 'WP',
        zip: '50000',
      }))
      expect(res.status).toBe(201)
      const data = await res.json()

      const logs = await prisma.branchAuditLog.findMany({
        where: { branchId: data.branch.id },
      })
      expect(logs).toHaveLength(1)
      expect(logs[0].action).toBe('CREATE')
      expect(logs[0].actorId).toBe(ownerId)
      expect(logs[0].actorEmail).toBe(`${TEST_PREFIX}-owner@test.com`)
      expect(logs[0].branchNameAtEvent).toBe(branchName)
      const changes = logs[0].changes as { after: Record<string, unknown> }
      expect(changes.after.name).toBe(branchName)
      expect(changes.after.phone).toBe('+60123456789')

      // Cleanup
      await prisma.branchAuditLog.deleteMany({ where: { branchId: data.branch.id } })
      await prisma.branchMember.deleteMany({ where: { branchId: data.branch.id } })
      await prisma.branch.delete({ where: { id: data.branch.id } })
    })
  })

  // ─── GET /api/branches/[branchId] ───

  describe('GET /api/branches/[branchId]', () => {
    let GET: typeof import('../../branches/[branchId]/route').GET

    beforeEach(async () => {
      const mod = await import('../../branches/[branchId]/route')
      GET = mod.GET
    })

    it('returns branch with members and patient count', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(
        createRequest('GET', `/api/branches/${branch1Id}`),
        { params: Promise.resolve({ branchId: branch1Id }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.branch.name).toBe(`${TEST_PREFIX} Branch 1`)
      expect(data.branch.members).toHaveLength(3)
      expect(data.branch.patientCount).toBe(1)
    })

    it('returns 403 for non-member', async () => {
      mockAuth.mockResolvedValue({ user: { id: outsiderId } })
      const res = await GET(
        createRequest('GET', `/api/branches/${branch1Id}`),
        { params: Promise.resolve({ branchId: branch1Id }) }
      )
      expect(res.status).toBe(403)
    })

    it('returns 404 for non-existent branch', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(
        createRequest('GET', '/api/branches/nonexistent'),
        { params: Promise.resolve({ branchId: 'nonexistent' }) }
      )
      expect(res.status).toBe(404)
    })
  })

  // ─── PATCH /api/branches/[branchId] ───

  describe('PATCH /api/branches/[branchId]', () => {
    let PATCH: typeof import('../../branches/[branchId]/route').PATCH

    beforeEach(async () => {
      const mod = await import('../../branches/[branchId]/route')
      PATCH = mod.PATCH
    })

    it('OWNER can update name, address, phone, email', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId, email: `${TEST_PREFIX}-owner@test.com`, name: 'Test Owner' } })
      const res = await PATCH(
        createRequest('PATCH', `/api/branches/${branch1Id}`, {
          name: `${TEST_PREFIX} Branch 1 Updated`,
          address: '123 Test St',
          phone: '+60123456789',
          email: 'branch@test.com',
        }),
        { params: Promise.resolve({ branchId: branch1Id }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.branch.name).toBe(`${TEST_PREFIX} Branch 1 Updated`)
      expect(data.branch.address).toBe('123 Test St')

      // Verify in DB
      const dbBranch = await prisma.branch.findUnique({ where: { id: branch1Id } })
      expect(dbBranch!.address).toBe('123 Test St')

      // Restore
      await prisma.branch.update({
        where: { id: branch1Id },
        data: { name: `${TEST_PREFIX} Branch 1`, address: null, phone: null, email: null },
      })
      await prisma.branchAuditLog.deleteMany({ where: { branchId: branch1Id } })
    })

    it('writes an UPDATE audit-log row containing only the changed fields', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId, email: `${TEST_PREFIX}-owner@test.com`, name: 'Test Owner' } })
      await prisma.branchAuditLog.deleteMany({ where: { branchId: branch1Id } })
      const res = await PATCH(
        createRequest('PATCH', `/api/branches/${branch1Id}`, {
          phone: '+60111111111',
        }),
        { params: Promise.resolve({ branchId: branch1Id }) }
      )
      expect(res.status).toBe(200)

      const logs = await prisma.branchAuditLog.findMany({
        where: { branchId: branch1Id, action: 'UPDATE' },
      })
      expect(logs).toHaveLength(1)
      expect(logs[0].actorId).toBe(ownerId)
      const changes = logs[0].changes as { before: Record<string, unknown>; after: Record<string, unknown> }
      expect(changes.before).toEqual({ phone: null })
      expect(changes.after).toEqual({ phone: '+60111111111' })
      // Unchanged fields should NOT appear
      expect(changes.after.name).toBeUndefined()

      // Restore
      await prisma.branch.update({ where: { id: branch1Id }, data: { phone: null } })
      await prisma.branchAuditLog.deleteMany({ where: { branchId: branch1Id } })
    })

    it('writes no audit-log row for a no-op PATCH (zero changed fields)', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId, email: `${TEST_PREFIX}-owner@test.com`, name: 'Test Owner' } })
      await prisma.branchAuditLog.deleteMany({ where: { branchId: branch1Id } })
      const res = await PATCH(
        createRequest('PATCH', `/api/branches/${branch1Id}`, {
          name: `${TEST_PREFIX} Branch 1`, // unchanged
        }),
        { params: Promise.resolve({ branchId: branch1Id }) }
      )
      expect(res.status).toBe(200)

      const logs = await prisma.branchAuditLog.findMany({
        where: { branchId: branch1Id, action: 'UPDATE' },
      })
      expect(logs).toHaveLength(0)
    })

    it('ADMIN cannot update branch details (403)', async () => {
      mockAuth.mockResolvedValue({ user: { id: adminId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/branches/${branch1Id}`, { name: `${TEST_PREFIX} Branch 1 Admin Edit` }),
        { params: Promise.resolve({ branchId: branch1Id }) }
      )
      expect(res.status).toBe(403)
      // No audit row should be written
      const logs = await prisma.branchAuditLog.findMany({ where: { branchId: branch1Id, actorId: adminId } })
      expect(logs).toHaveLength(0)
    })

    it('DOCTOR cannot update (403)', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/branches/${branch1Id}`, { name: 'Hacked' }),
        { params: Promise.resolve({ branchId: branch1Id }) }
      )
      expect(res.status).toBe(403)
    })

    it('rejects empty name', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/branches/${branch1Id}`, { name: '  ' }),
        { params: Promise.resolve({ branchId: branch1Id }) }
      )
      expect(res.status).toBe(400)
    })

    it('validates email format', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/branches/${branch1Id}`, { email: 'bad-email' }),
        { params: Promise.resolve({ branchId: branch1Id }) }
      )
      expect(res.status).toBe(400)
    })

    it('returns 404 for non-existent branch', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await PATCH(
        createRequest('PATCH', '/api/branches/nonexistent', { name: 'X' }),
        { params: Promise.resolve({ branchId: 'nonexistent' }) }
      )
      expect(res.status).toBe(404)
    })
  })

  // ─── DELETE /api/branches/[branchId] ───

  describe('DELETE /api/branches/[branchId]', () => {
    let DELETE: typeof import('../../branches/[branchId]/route').DELETE

    beforeEach(async () => {
      const mod = await import('../../branches/[branchId]/route')
      DELETE = mod.DELETE
    })

    it('ADMIN cannot delete (403)', async () => {
      mockAuth.mockResolvedValue({ user: { id: adminId } })
      const res = await DELETE(
        createRequest('DELETE', `/api/branches/${branch1Id}`),
        { params: Promise.resolve({ branchId: branch1Id }) }
      )
      expect(res.status).toBe(403)
    })

    it('DOCTOR cannot delete (403)', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await DELETE(
        createRequest('DELETE', `/api/branches/${branch1Id}`),
        { params: Promise.resolve({ branchId: branch1Id }) }
      )
      expect(res.status).toBe(403)
    })

    it('returns 404 for non-existent branch', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await DELETE(
        createRequest('DELETE', '/api/branches/nonexistent'),
        { params: Promise.resolve({ branchId: 'nonexistent' }) }
      )
      expect(res.status).toBe(404)
    })

    it('OWNER can delete branch and cascade removes members & patients', async () => {
      // Create a disposable branch with a patient
      const tempBranch = await prisma.branch.create({ data: { name: `${TEST_PREFIX} Disposable` } })
      await prisma.branchMember.create({ data: { userId: ownerId, branchId: tempBranch.id, role: 'OWNER' } })
      const tempPatient = await prisma.patient.create({
        data: { firstName: 'Temp', lastName: 'Patient', branchId: tempBranch.id, doctorId: ownerId },
      })

      mockAuth.mockResolvedValue({ user: { id: ownerId, email: `${TEST_PREFIX}-owner@test.com`, name: 'Test Owner' } })
      const res = await DELETE(
        createRequest('DELETE', `/api/branches/${tempBranch.id}`),
        { params: Promise.resolve({ branchId: tempBranch.id }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)

      // Verify cascade in Neon DB
      const dbBranch = await prisma.branch.findUnique({ where: { id: tempBranch.id } })
      expect(dbBranch).toBeNull()
      const dbPatient = await prisma.patient.findUnique({ where: { id: tempPatient.id } })
      expect(dbPatient).toBeNull()

      // Audit row persists past the delete (no FK)
      const logs = await prisma.branchAuditLog.findMany({ where: { branchId: tempBranch.id } })
      expect(logs).toHaveLength(1)
      expect(logs[0].action).toBe('DELETE')
      expect(logs[0].branchNameAtEvent).toBe(`${TEST_PREFIX} Disposable`)
      const changes = logs[0].changes as { before: Record<string, unknown> }
      expect(changes.before.name).toBe(`${TEST_PREFIX} Disposable`)

      // Cleanup
      await prisma.branchAuditLog.deleteMany({ where: { branchId: tempBranch.id } })
    })
  })

  // ─── GET /api/branches/[branchId]/audit-log ───

  describe('GET /api/branches/[branchId]/audit-log', () => {
    let auditGET: typeof import('../../branches/[branchId]/audit-log/route').GET
    let logBranchId: string
    const seedLogIds: string[] = []

    beforeAll(async () => {
      const mod = await import('../../branches/[branchId]/audit-log/route')
      auditGET = mod.GET

      // Create a dedicated branch for audit-log testing with members
      const b = await prisma.branch.create({ data: { name: `${TEST_PREFIX} Audit Branch` } })
      logBranchId = b.id
      await prisma.branchMember.create({ data: { userId: ownerId, branchId: logBranchId, role: 'OWNER' } })
      await prisma.branchMember.create({ data: { userId: adminId, branchId: logBranchId, role: 'ADMIN' } })
      await prisma.branchMember.create({ data: { userId: doctorId, branchId: logBranchId, role: 'DOCTOR' } })

      // Seed 60 audit rows so we can test pagination
      for (let i = 0; i < 60; i++) {
        const log = await prisma.branchAuditLog.create({
          data: {
            branchId: logBranchId,
            action: 'UPDATE',
            actorId: ownerId,
            actorEmail: `${TEST_PREFIX}-owner@test.com`,
            actorName: 'Test Owner',
            branchNameAtEvent: `${TEST_PREFIX} Audit Branch`,
            changes: { before: { phone: `+6010${i}` }, after: { phone: `+6011${i}` } },
          },
        })
        seedLogIds.push(log.id)
      }
    })

    afterAll(async () => {
      await prisma.branchAuditLog.deleteMany({ where: { branchId: logBranchId } })
      await prisma.branchMember.deleteMany({ where: { branchId: logBranchId } })
      await prisma.branch.delete({ where: { id: logBranchId } })
    })

    it('returns 401 for unauthenticated request', async () => {
      mockAuth.mockResolvedValue(null)
      const res = await auditGET(
        createRequest('GET', `/api/branches/${logBranchId}/audit-log`),
        { params: Promise.resolve({ branchId: logBranchId }) }
      )
      expect(res.status).toBe(401)
    })

    it('OWNER can read the audit log', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await auditGET(
        createRequest('GET', `/api/branches/${logBranchId}/audit-log`),
        { params: Promise.resolve({ branchId: logBranchId }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.entries).toHaveLength(50) // default limit
      expect(typeof data.nextCursor).toBe('string')
    })

    it('ADMIN can read the audit log', async () => {
      mockAuth.mockResolvedValue({ user: { id: adminId } })
      const res = await auditGET(
        createRequest('GET', `/api/branches/${logBranchId}/audit-log`),
        { params: Promise.resolve({ branchId: logBranchId }) }
      )
      expect(res.status).toBe(200)
    })

    it('DOCTOR cannot read the audit log (403)', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await auditGET(
        createRequest('GET', `/api/branches/${logBranchId}/audit-log`),
        { params: Promise.resolve({ branchId: logBranchId }) }
      )
      expect(res.status).toBe(403)
    })

    it('non-member returns 404 (matches existing GET pattern)', async () => {
      mockAuth.mockResolvedValue({ user: { id: outsiderId } })
      const res = await auditGET(
        createRequest('GET', `/api/branches/${logBranchId}/audit-log`),
        { params: Promise.resolve({ branchId: logBranchId }) }
      )
      expect(res.status).toBe(404)
    })

    it('returns entries in createdAt DESC order', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await auditGET(
        createRequest('GET', `/api/branches/${logBranchId}/audit-log?limit=5`),
        { params: Promise.resolve({ branchId: logBranchId }) }
      )
      const data = await res.json()
      const dates: number[] = data.entries.map((e: { createdAt: string }) => new Date(e.createdAt).getTime())
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i])
      }
    })

    it('paginates with cursor', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const page1 = await auditGET(
        createRequest('GET', `/api/branches/${logBranchId}/audit-log?limit=20`),
        { params: Promise.resolve({ branchId: logBranchId }) }
      )
      const data1 = await page1.json()
      expect(data1.entries).toHaveLength(20)
      expect(data1.nextCursor).toBeTruthy()

      const page2 = await auditGET(
        createRequest('GET', `/api/branches/${logBranchId}/audit-log?limit=20&cursor=${data1.nextCursor}`),
        { params: Promise.resolve({ branchId: logBranchId }) }
      )
      const data2 = await page2.json()
      expect(data2.entries).toHaveLength(20)
      // No overlap between pages
      const page1Ids = new Set(data1.entries.map((e: { id: string }) => e.id))
      for (const e of data2.entries) {
        expect(page1Ids.has(e.id)).toBe(false)
      }
    })

    it('clamps limit to a maximum of 100', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await auditGET(
        createRequest('GET', `/api/branches/${logBranchId}/audit-log?limit=999`),
        { params: Promise.resolve({ branchId: logBranchId }) }
      )
      const data = await res.json()
      expect(data.entries.length).toBeLessThanOrEqual(100)
    })

    it('returns 404 for a branch with no rows AND no audit history', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await auditGET(
        createRequest('GET', '/api/branches/totally-nonexistent/audit-log'),
        { params: Promise.resolve({ branchId: 'totally-nonexistent' }) }
      )
      expect(res.status).toBe(404)
    })
  })
})
