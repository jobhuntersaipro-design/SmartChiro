import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// Mock auth
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

const TEST_PREFIX = `test-members-${Date.now()}`

let ownerId: string
let adminId: string
let doctorId: string
let doctor2Id: string
let outsiderId: string
let branchId: string
let ownerMemberId: string
let adminMemberId: string
let doctorMemberId: string

function createRequest(method: string, url: string, body?: Record<string, unknown>): NextRequest {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) init.body = JSON.stringify(body)
  return new NextRequest(`http://localhost:3000${url}`, init)
}

describe('Branch Members', () => {
  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-owner@test.com`, name: 'Owner' },
    })
    const admin = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-admin@test.com`, name: 'Admin' },
    })
    const doctor = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-doctor@test.com`, name: 'Doctor' },
    })
    const doctor2 = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-doctor2@test.com`, name: 'Doctor 2' },
    })
    const outsider = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-outsider@test.com`, name: 'Outsider' },
    })

    ownerId = owner.id
    adminId = admin.id
    doctorId = doctor.id
    doctor2Id = doctor2.id
    outsiderId = outsider.id

    const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX} Branch` } })
    branchId = branch.id

    const ownerMember = await prisma.branchMember.create({
      data: { userId: ownerId, branchId, role: 'OWNER' },
    })
    const adminMember = await prisma.branchMember.create({
      data: { userId: adminId, branchId, role: 'ADMIN' },
    })
    const doctorMember = await prisma.branchMember.create({
      data: { userId: doctorId, branchId, role: 'DOCTOR' },
    })

    ownerMemberId = ownerMember.id
    adminMemberId = adminMember.id
    doctorMemberId = doctorMember.id

    // Create patients assigned to doctor for count testing
    await prisma.patient.create({
      data: { firstName: 'P1', lastName: 'Test', branchId, doctorId },
    })
    await prisma.patient.create({
      data: { firstName: 'P2', lastName: 'Test', branchId, doctorId },
    })
  })

  afterAll(async () => {
    await prisma.patient.deleteMany({ where: { branchId } })
    await prisma.branchMember.deleteMany({ where: { branchId } })
    await prisma.branch.delete({ where: { id: branchId } })
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, adminId, doctorId, doctor2Id, outsiderId] } },
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── GET /api/branches/[branchId]/members/[memberId] ───

  describe('GET /api/branches/[branchId]/members/[memberId]', () => {
    let GET: typeof import('../../branches/[branchId]/members/[memberId]/route').GET

    beforeEach(async () => {
      const mod = await import('../../branches/[branchId]/members/[memberId]/route')
      GET = mod.GET
    })

    it('returns member with patient count', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(
        createRequest('GET', `/api/branches/${branchId}/members/${doctorMemberId}`),
        { params: Promise.resolve({ branchId, memberId: doctorMemberId }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.member.name).toBe('Doctor')
      expect(data.member.role).toBe('DOCTOR')
      expect(data.member.patientCount).toBe(2)
    })

    it('returns 403 for non-branch-member', async () => {
      mockAuth.mockResolvedValue({ user: { id: outsiderId } })
      const res = await GET(
        createRequest('GET', `/api/branches/${branchId}/members/${doctorMemberId}`),
        { params: Promise.resolve({ branchId, memberId: doctorMemberId }) }
      )
      expect(res.status).toBe(403)
    })

    it('returns 404 for non-existent member', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(
        createRequest('GET', `/api/branches/${branchId}/members/nonexistent`),
        { params: Promise.resolve({ branchId, memberId: 'nonexistent' }) }
      )
      expect(res.status).toBe(404)
    })
  })

  // ─── POST /api/branches/[branchId]/members ───

  describe('POST /api/branches/[branchId]/members', () => {
    let POST: typeof import('../../branches/[branchId]/members/route').POST

    beforeEach(async () => {
      const mod = await import('../../branches/[branchId]/members/route')
      POST = mod.POST
    })

    it('adds a new member and persists in Neon DB', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await POST(
        createRequest('POST', `/api/branches/${branchId}/members`, {
          email: `${TEST_PREFIX}-doctor2@test.com`,
          role: 'DOCTOR',
        }),
        { params: Promise.resolve({ branchId }) }
      )
      expect(res.status).toBe(201)

      // Verify in DB
      const dbMember = await prisma.branchMember.findUnique({
        where: { userId_branchId: { userId: doctor2Id, branchId } },
      })
      expect(dbMember).not.toBeNull()
      expect(dbMember!.role).toBe('DOCTOR')

      // Cleanup
      await prisma.branchMember.delete({ where: { id: dbMember!.id } })
    })

    it('returns 409 for duplicate member', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await POST(
        createRequest('POST', `/api/branches/${branchId}/members`, {
          email: `${TEST_PREFIX}-doctor@test.com`,
          role: 'DOCTOR',
        }),
        { params: Promise.resolve({ branchId }) }
      )
      expect(res.status).toBe(409)
    })

    it('DOCTOR cannot add members (403)', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(
        createRequest('POST', `/api/branches/${branchId}/members`, {
          email: `${TEST_PREFIX}-outsider@test.com`,
          role: 'DOCTOR',
        }),
        { params: Promise.resolve({ branchId }) }
      )
      expect(res.status).toBe(403)
    })
  })

  // ─── PATCH /api/branches/[branchId]/members/[memberId] ───

  describe('PATCH /api/branches/[branchId]/members/[memberId]', () => {
    let PATCH: typeof import('../../branches/[branchId]/members/[memberId]/route').PATCH

    beforeEach(async () => {
      const mod = await import('../../branches/[branchId]/members/[memberId]/route')
      PATCH = mod.PATCH
    })

    it('OWNER can change a member role and it persists in DB', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/branches/${branchId}/members/${doctorMemberId}`, { role: 'ADMIN' }),
        { params: Promise.resolve({ branchId, memberId: doctorMemberId }) }
      )
      expect(res.status).toBe(200)

      // Verify in DB
      const dbMember = await prisma.branchMember.findUnique({ where: { id: doctorMemberId } })
      expect(dbMember!.role).toBe('ADMIN')

      // Restore
      await prisma.branchMember.update({ where: { id: doctorMemberId }, data: { role: 'DOCTOR' } })
    })

    it('OWNER can transfer ownership atomically', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/branches/${branchId}/members/${adminMemberId}`, { role: 'OWNER' }),
        { params: Promise.resolve({ branchId, memberId: adminMemberId }) }
      )
      expect(res.status).toBe(200)

      // Verify: admin is now OWNER, previous owner is ADMIN
      const newOwner = await prisma.branchMember.findUnique({ where: { id: adminMemberId } })
      expect(newOwner!.role).toBe('OWNER')
      const prevOwner = await prisma.branchMember.findUnique({ where: { id: ownerMemberId } })
      expect(prevOwner!.role).toBe('ADMIN')

      // Restore
      await prisma.branchMember.update({ where: { id: ownerMemberId }, data: { role: 'OWNER' } })
      await prisma.branchMember.update({ where: { id: adminMemberId }, data: { role: 'ADMIN' } })
    })
  })

  // ─── DELETE /api/branches/[branchId]/members/[memberId] ───

  describe('DELETE /api/branches/[branchId]/members/[memberId]', () => {
    let DELETE: typeof import('../../branches/[branchId]/members/[memberId]/route').DELETE

    beforeEach(async () => {
      const mod = await import('../../branches/[branchId]/members/[memberId]/route')
      DELETE = mod.DELETE
    })

    it('cannot remove the branch owner', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await DELETE(
        createRequest('DELETE', `/api/branches/${branchId}/members/${ownerMemberId}`),
        { params: Promise.resolve({ branchId, memberId: ownerMemberId }) }
      )
      expect(res.status).toBe(403)
    })

    it('OWNER can remove a member and it is deleted from DB', async () => {
      // Create a temp member to remove
      const tempMember = await prisma.branchMember.create({
        data: { userId: doctor2Id, branchId, role: 'DOCTOR' },
      })

      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await DELETE(
        createRequest('DELETE', `/api/branches/${branchId}/members/${tempMember.id}`),
        { params: Promise.resolve({ branchId, memberId: tempMember.id }) }
      )
      expect(res.status).toBe(200)

      // Verify removed from DB
      const dbMember = await prisma.branchMember.findUnique({ where: { id: tempMember.id } })
      expect(dbMember).toBeNull()
    })
  })
})
