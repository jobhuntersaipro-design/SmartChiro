import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// Mock auth
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

const TEST_PREFIX = `test-patients-${Date.now()}`

let ownerId: string
let adminId: string
let doctorId: string
let doctor2Id: string
let outsiderId: string
let branchId: string
let branch2Id: string
let patient1Id: string
let patient2Id: string
let patient3Id: string

function createRequest(method: string, url: string, body?: Record<string, unknown>): NextRequest {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) init.body = JSON.stringify(body)
  return new NextRequest(`http://localhost:3000${url}`, init)
}

describe('Patient CRUD', () => {
  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-owner@test.com`, name: 'Owner' },
    })
    const admin = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-admin@test.com`, name: 'Admin' },
    })
    const doctor = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-doctor@test.com`, name: 'Dr. Smith' },
    })
    const doctor2 = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-doctor2@test.com`, name: 'Dr. Jones' },
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
    const b2 = await prisma.branch.create({ data: { name: `${TEST_PREFIX} Branch 2` } })
    branchId = branch.id
    branch2Id = b2.id

    await prisma.branchMember.create({ data: { userId: ownerId, branchId, role: 'OWNER' } })
    await prisma.branchMember.create({ data: { userId: adminId, branchId, role: 'ADMIN' } })
    await prisma.branchMember.create({ data: { userId: doctorId, branchId, role: 'DOCTOR' } })
    await prisma.branchMember.create({ data: { userId: doctor2Id, branchId, role: 'DOCTOR' } })
    await prisma.branchMember.create({ data: { userId: outsiderId, branchId: branch2Id, role: 'OWNER' } })

    await prisma.user.update({ where: { id: ownerId }, data: { activeBranchId: branchId } })
    await prisma.user.update({ where: { id: adminId }, data: { activeBranchId: branchId } })
    await prisma.user.update({ where: { id: doctorId }, data: { activeBranchId: branchId } })
    await prisma.user.update({ where: { id: outsiderId }, data: { activeBranchId: branch2Id } })

    const p1 = await prisma.patient.create({
      data: {
        firstName: 'Alice',
        lastName: 'Tan',
        email: 'alice@test.com',
        phone: '+60123456789',
        branchId,
        doctorId,
      },
    })
    const p2 = await prisma.patient.create({
      data: {
        firstName: 'Bob',
        lastName: 'Lee',
        email: 'bob@test.com',
        branchId,
        doctorId,
      },
    })
    const p3 = await prisma.patient.create({
      data: {
        firstName: 'Charlie',
        lastName: 'Wong',
        branchId,
        doctorId: doctor2Id,
      },
    })

    patient1Id = p1.id
    patient2Id = p2.id
    patient3Id = p3.id
  })

  afterAll(async () => {
    await prisma.patient.deleteMany({ where: { branchId: { in: [branchId, branch2Id] } } })
    await prisma.branchMember.deleteMany({ where: { branchId: { in: [branchId, branch2Id] } } })
    await prisma.branch.deleteMany({ where: { id: { in: [branchId, branch2Id] } } })
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, adminId, doctorId, doctor2Id, outsiderId] } },
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── GET /api/patients (role-aware listing) ───

  describe('GET /api/patients', () => {
    let GET: typeof import('../../patients/route').GET

    beforeEach(async () => {
      const mod = await import('../../patients/route')
      GET = mod.GET
    })

    it('returns 401 for unauthenticated request', async () => {
      mockAuth.mockResolvedValue(null)
      const res = await GET(createRequest('GET', '/api/patients'))
      expect(res.status).toBe(401)
    })

    it('DOCTOR sees only own patients', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await GET(createRequest('GET', '/api/patients'))
      expect(res.status).toBe(200)
      const data = await res.json()
      // doctorId has 2 patients (Alice, Bob), doctor2Id has Charlie
      expect(data.length).toBe(2)
      const names = data.map((p: { firstName: string }) => p.firstName)
      expect(names).toContain('Alice')
      expect(names).toContain('Bob')
      expect(names).not.toContain('Charlie')
    })

    it('OWNER sees all patients in branch', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(createRequest('GET', '/api/patients'))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.length).toBeGreaterThanOrEqual(3)
    })

    it('ADMIN sees all patients in branch', async () => {
      mockAuth.mockResolvedValue({ user: { id: adminId } })
      const res = await GET(createRequest('GET', '/api/patients'))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.length).toBeGreaterThanOrEqual(3)
    })

    it('search by firstName (case-insensitive)', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(createRequest('GET', '/api/patients?search=alice'))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.length).toBeGreaterThanOrEqual(1)
      expect(data[0].firstName).toBe('Alice')
    })

    it('search by phone', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(createRequest('GET', '/api/patients?search=60123'))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.length).toBeGreaterThanOrEqual(1)
      expect(data[0].firstName).toBe('Alice')
    })

    it('returns empty array when no patients match search', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(createRequest('GET', '/api/patients?search=zzzznonexistent'))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toHaveLength(0)
    })
  })

  // ─── POST /api/patients ───

  describe('POST /api/patients', () => {
    let POST: typeof import('../../patients/route').POST

    beforeEach(async () => {
      const mod = await import('../../patients/route')
      POST = mod.POST
    })

    it('creates patient and persists in Neon DB', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'David',
        lastName: 'Lim',
        email: 'david@test.com',
      }))
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.firstName).toBe('David')

      // Verify in DB
      const dbPatient = await prisma.patient.findUnique({ where: { id: data.id } })
      expect(dbPatient).not.toBeNull()
      expect(dbPatient!.lastName).toBe('Lim')

      // Cleanup
      await prisma.patient.delete({ where: { id: data.id } })
    })

    it('rejects missing firstName', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        lastName: 'Lim',
      }))
      expect(res.status).toBe(400)
    })

    it('validates email format', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'Test',
        lastName: 'User',
        email: 'not-valid',
      }))
      expect(res.status).toBe(400)
    })
  })

  // ─── GET /api/patients/[patientId] ───

  describe('GET /api/patients/[patientId]', () => {
    let GET: typeof import('../../patients/[patientId]/route').GET

    beforeEach(async () => {
      const mod = await import('../../patients/[patientId]/route')
      GET = mod.GET
    })

    it('assigned doctor can view', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await GET(
        createRequest('GET', `/api/patients/${patient1Id}`),
        { params: Promise.resolve({ patientId: patient1Id }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.patient.firstName).toBe('Alice')
      expect(data.patient.doctorName).toBe('Dr. Smith')
    })

    it('OWNER of branch can view', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(
        createRequest('GET', `/api/patients/${patient1Id}`),
        { params: Promise.resolve({ patientId: patient1Id }) }
      )
      expect(res.status).toBe(200)
    })

    it('ADMIN of branch can view', async () => {
      mockAuth.mockResolvedValue({ user: { id: adminId } })
      const res = await GET(
        createRequest('GET', `/api/patients/${patient1Id}`),
        { params: Promise.resolve({ patientId: patient1Id }) }
      )
      expect(res.status).toBe(200)
    })

    it('doctor of different branch cannot view (403)', async () => {
      mockAuth.mockResolvedValue({ user: { id: outsiderId } })
      const res = await GET(
        createRequest('GET', `/api/patients/${patient1Id}`),
        { params: Promise.resolve({ patientId: patient1Id }) }
      )
      expect(res.status).toBe(403)
    })

    it('returns 404 for non-existent patient', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await GET(
        createRequest('GET', '/api/patients/nonexistent'),
        { params: Promise.resolve({ patientId: 'nonexistent' }) }
      )
      expect(res.status).toBe(404)
    })
  })

  // ─── PATCH /api/patients/[patientId] ───

  describe('PATCH /api/patients/[patientId]', () => {
    let PATCH: typeof import('../../patients/[patientId]/route').PATCH

    beforeEach(async () => {
      const mod = await import('../../patients/[patientId]/route')
      PATCH = mod.PATCH
    })

    it('assigned doctor can update', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/patients/${patient1Id}`, {
          phone: '+60199999999',
        }),
        { params: Promise.resolve({ patientId: patient1Id }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.patient.phone).toBe('+60199999999')

      // Verify in DB
      const dbPatient = await prisma.patient.findUnique({ where: { id: patient1Id } })
      expect(dbPatient!.phone).toBe('+60199999999')
    })

    it('OWNER can update', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/patients/${patient1Id}`, { notes: 'Owner note' }),
        { params: Promise.resolve({ patientId: patient1Id }) }
      )
      expect(res.status).toBe(200)
    })

    it('unrelated doctor cannot update (403)', async () => {
      mockAuth.mockResolvedValue({ user: { id: outsiderId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/patients/${patient1Id}`, { notes: 'Hacked' }),
        { params: Promise.resolve({ patientId: patient1Id }) }
      )
      expect(res.status).toBe(403)
    })

    it('can reassign to different doctor in same branch', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/patients/${patient2Id}`, { doctorId: doctor2Id }),
        { params: Promise.resolve({ patientId: patient2Id }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.patient.doctorId).toBe(doctor2Id)

      // Restore
      await prisma.patient.update({ where: { id: patient2Id }, data: { doctorId } })
    })

    it('cannot reassign to doctor not in branch (400)', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/patients/${patient1Id}`, { doctorId: outsiderId }),
        { params: Promise.resolve({ patientId: patient1Id }) }
      )
      expect(res.status).toBe(400)
    })

    it('rejects empty firstName', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/patients/${patient1Id}`, { firstName: '  ' }),
        { params: Promise.resolve({ patientId: patient1Id }) }
      )
      expect(res.status).toBe(400)
    })
  })

  // ─── DELETE /api/patients/[patientId] ───

  describe('DELETE /api/patients/[patientId]', () => {
    let DELETE: typeof import('../../patients/[patientId]/route').DELETE

    beforeEach(async () => {
      const mod = await import('../../patients/[patientId]/route')
      DELETE = mod.DELETE
    })

    it('unrelated doctor cannot delete (403)', async () => {
      mockAuth.mockResolvedValue({ user: { id: outsiderId } })
      const res = await DELETE(
        createRequest('DELETE', `/api/patients/${patient1Id}`),
        { params: Promise.resolve({ patientId: patient1Id }) }
      )
      expect(res.status).toBe(403)
    })

    it('returns 404 for non-existent patient', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await DELETE(
        createRequest('DELETE', '/api/patients/nonexistent'),
        { params: Promise.resolve({ patientId: 'nonexistent' }) }
      )
      expect(res.status).toBe(404)
    })

    it('assigned doctor can delete and it is removed from DB', async () => {
      // Create disposable patient
      const temp = await prisma.patient.create({
        data: { firstName: 'Temp', lastName: 'Del', branchId, doctorId },
      })

      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await DELETE(
        createRequest('DELETE', `/api/patients/${temp.id}`),
        { params: Promise.resolve({ patientId: temp.id }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)

      // Verify deleted from Neon DB
      const dbPatient = await prisma.patient.findUnique({ where: { id: temp.id } })
      expect(dbPatient).toBeNull()
    })

    it('OWNER can delete', async () => {
      const temp = await prisma.patient.create({
        data: { firstName: 'Temp2', lastName: 'Del', branchId, doctorId },
      })

      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await DELETE(
        createRequest('DELETE', `/api/patients/${temp.id}`),
        { params: Promise.resolve({ patientId: temp.id }) }
      )
      expect(res.status).toBe(200)
    })
  })
})
