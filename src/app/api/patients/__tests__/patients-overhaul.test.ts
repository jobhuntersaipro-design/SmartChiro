import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// Mock auth
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

const TEST_PREFIX = `test-po-${Date.now()}`

let ownerId: string
let adminId: string
let doctorId: string
let doctor2Id: string
let outsiderId: string
let branchId: string
let branch2Id: string
let patientWithIcId: string
let patientActiveId: string
let patientInactiveId: string
let patientDischargedId: string

function createRequest(method: string, url: string, body?: Record<string, unknown>): NextRequest {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) init.body = JSON.stringify(body)
  return new NextRequest(`http://localhost:3000${url}`, init)
}

describe('Patient Overhaul', () => {
  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `${TEST_PREFIX}-owner@t.com`, name: 'Owner' } })
    const admin = await prisma.user.create({ data: { email: `${TEST_PREFIX}-admin@t.com`, name: 'Admin' } })
    const doctor = await prisma.user.create({ data: { email: `${TEST_PREFIX}-doc@t.com`, name: 'Dr. Chen' } })
    const doctor2 = await prisma.user.create({ data: { email: `${TEST_PREFIX}-doc2@t.com`, name: 'Dr. Khan' } })
    const outsider = await prisma.user.create({ data: { email: `${TEST_PREFIX}-out@t.com`, name: 'Outsider' } })

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

    const pIc = await prisma.patient.create({
      data: {
        firstName: 'Ahmad', lastName: 'Rahman',
        icNumber: '850315-08-5234', occupation: 'Engineer',
        race: 'Malay', bloodType: 'O+', status: 'active',
        branchId, doctorId,
      },
    })
    const pActive = await prisma.patient.create({
      data: { firstName: 'Siti', lastName: 'Aminah', status: 'active', branchId, doctorId },
    })
    const pInactive = await prisma.patient.create({
      data: { firstName: 'Raj', lastName: 'Kumar', status: 'inactive', branchId, doctorId: doctor2Id },
    })
    const pDischarged = await prisma.patient.create({
      data: { firstName: 'Lin', lastName: 'Wei', status: 'discharged', branchId, doctorId: doctor2Id },
    })

    patientWithIcId = pIc.id
    patientActiveId = pActive.id
    patientInactiveId = pInactive.id
    patientDischargedId = pDischarged.id
  })

  afterAll(async () => {
    await prisma.patient.deleteMany({ where: { branchId: { in: [branchId, branch2Id] } } })
    await prisma.branchMember.deleteMany({ where: { branchId: { in: [branchId, branch2Id] } } })
    await prisma.branch.deleteMany({ where: { id: { in: [branchId, branch2Id] } } })
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, adminId, doctorId, doctor2Id, outsiderId] } },
    })
  })

  beforeEach(() => { vi.clearAllMocks() })

  // ─── GET /api/patients — Enhanced ───
  describe('GET /api/patients — Enhanced', () => {
    let GET: typeof import('../../patients/route').GET

    beforeEach(async () => {
      const mod = await import('../../patients/route')
      GET = mod.GET
    })

    it('1. returns new fields (icNumber, occupation, status)', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(createRequest('GET', '/api/patients'))
      const data = await res.json()
      const ahmad = data.find((p: { firstName: string }) => p.firstName === 'Ahmad')
      expect(ahmad).toBeDefined()
      expect(ahmad.icNumber).toBe('850315-08-5234')
      expect(ahmad.occupation).toBe('Engineer')
      expect(ahmad.status).toBe('active')
    })

    it('2. filters by status=active', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(createRequest('GET', '/api/patients?status=active'))
      const data = await res.json()
      expect(data.every((p: { status: string }) => p.status === 'active')).toBe(true)
    })

    it('3. filters by status=inactive', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(createRequest('GET', '/api/patients?status=inactive'))
      const data = await res.json()
      expect(data.length).toBeGreaterThanOrEqual(1)
      expect(data.every((p: { status: string }) => p.status === 'inactive')).toBe(true)
    })

    it('4. filters by status=discharged', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(createRequest('GET', '/api/patients?status=discharged'))
      const data = await res.json()
      expect(data.length).toBeGreaterThanOrEqual(1)
      expect(data.every((p: { status: string }) => p.status === 'discharged')).toBe(true)
    })

    it('5. filters by doctorId (OWNER)', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(createRequest('GET', `/api/patients?doctorId=${doctor2Id}`))
      const data = await res.json()
      expect(data.length).toBeGreaterThanOrEqual(2) // Raj + Lin
      expect(data.every((p: { doctorId: string }) => p.doctorId === doctor2Id)).toBe(true)
    })

    it('6. doctorId filter ignored for DOCTOR role', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await GET(createRequest('GET', `/api/patients?doctorId=${doctor2Id}`))
      const data = await res.json()
      // DOCTOR always sees own patients only
      expect(data.every((p: { doctorId: string }) => p.doctorId === doctorId)).toBe(true)
    })

    it('7. search matches IC number', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await GET(createRequest('GET', '/api/patients?search=850315'))
      const data = await res.json()
      expect(data.length).toBeGreaterThanOrEqual(1)
      expect(data[0].icNumber).toContain('850315')
    })
  })

  // ─── POST /api/patients — Enhanced ───
  describe('POST /api/patients — Enhanced', () => {
    let POST: typeof import('../../patients/route').POST
    const createdIds: string[] = []

    beforeEach(async () => {
      const mod = await import('../../patients/route')
      POST = mod.POST
    })

    afterAll(async () => {
      if (createdIds.length > 0) {
        await prisma.patient.deleteMany({ where: { id: { in: createdIds } } })
      }
    })

    it('8. creates with all new fields', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'Test', lastName: 'AllFields',
        icNumber: '920722-14-5678', occupation: 'Teacher', race: 'Chinese',
        maritalStatus: 'Married', bloodType: 'B+', allergies: 'Penicillin',
        referralSource: 'Walk-in',
        addressLine1: '123 Jalan Bukit', addressLine2: 'Unit 4A',
        city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '50450',
        emergencyName: 'Fatimah', emergencyPhone: '+60134567890', emergencyRelation: 'Spouse',
        medicalHistory: 'Back pain', notes: 'Morning appointments',
      }))
      expect(res.status).toBe(201)
      const data = await res.json()
      createdIds.push(data.id)
      expect(data.icNumber).toBe('920722-14-5678')
      expect(data.occupation).toBe('Teacher')
      expect(data.race).toBe('Chinese')
      expect(data.maritalStatus).toBe('Married')
      expect(data.bloodType).toBe('B+')
      expect(data.allergies).toBe('Penicillin')
      expect(data.addressLine1).toBe('123 Jalan Bukit')
      expect(data.emergencyName).toBe('Fatimah')
      expect(data.emergencyRelation).toBe('Spouse')
    })

    it('9. creates with only required fields (name)', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'Minimal', lastName: 'Patient',
      }))
      expect(res.status).toBe(201)
      const data = await res.json()
      createdIds.push(data.id)
      expect(data.icNumber).toBeNull()
      expect(data.occupation).toBeNull()
      expect(data.status).toBe('active')
    })

    it('10. validates IC number format (valid 12-digit)', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'Valid', lastName: 'IC', icNumber: '850315085234',
      }))
      expect(res.status).toBe(201)
      const data = await res.json()
      createdIds.push(data.id)
    })

    it('11. validates IC number format (invalid)', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'Bad', lastName: 'IC', icNumber: '123',
      }))
      expect(res.status).toBe(400)
    })

    it('12. validates bloodType enum', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'Bad', lastName: 'Blood', bloodType: 'X+',
      }))
      expect(res.status).toBe(400)
    })

    it('13. validates maritalStatus enum', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'Bad', lastName: 'Status', maritalStatus: 'Complicated',
      }))
      expect(res.status).toBe(400)
    })

    it('14. OWNER can assign doctorId to branch doctor', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'Assigned', lastName: 'Patient', doctorId: doctor2Id,
      }))
      expect(res.status).toBe(201)
      const data = await res.json()
      createdIds.push(data.id)
      expect(data.doctorId).toBe(doctor2Id)
    })

    it('15. cannot assign doctorId to non-branch doctor', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'Bad', lastName: 'Assign', doctorId: outsiderId,
      }))
      expect(res.status).toBe(400)
    })

    it('16. DOCTOR cannot assign to different doctor (defaults to self)', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'Self', lastName: 'Assign', doctorId: doctor2Id,
      }))
      expect(res.status).toBe(201)
      const data = await res.json()
      createdIds.push(data.id)
      expect(data.doctorId).toBe(doctorId)
    })

    it('17. auto-extracts DOB from IC when dateOfBirth empty', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'AutoDob', lastName: 'Test', icNumber: '850315-08-5234',
      }))
      expect(res.status).toBe(201)
      const data = await res.json()
      createdIds.push(data.id)
      expect(data.dateOfBirth).toBeDefined()
      expect(data.dateOfBirth).toContain('1985-03-15')
    })

    it('18. status defaults to active', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'Status', lastName: 'Default',
      }))
      expect(res.status).toBe(201)
      const data = await res.json()
      createdIds.push(data.id)
      expect(data.status).toBe('active')
    })

    it('19. address fields persisted correctly', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'Addr', lastName: 'Test',
        addressLine1: '99 Jalan Merdeka', city: 'Petaling Jaya', state: 'Selangor', postcode: '46000',
      }))
      expect(res.status).toBe(201)
      const data = await res.json()
      createdIds.push(data.id)
      expect(data.addressLine1).toBe('99 Jalan Merdeka')
      expect(data.city).toBe('Petaling Jaya')
      expect(data.state).toBe('Selangor')
      expect(data.postcode).toBe('46000')
    })

    it('20. emergency contact fields persisted', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await POST(createRequest('POST', '/api/patients', {
        firstName: 'Emerg', lastName: 'Test',
        emergencyName: 'Ali Bin Abu', emergencyPhone: '+60111234567', emergencyRelation: 'Parent',
      }))
      expect(res.status).toBe(201)
      const data = await res.json()
      createdIds.push(data.id)
      expect(data.emergencyName).toBe('Ali Bin Abu')
      expect(data.emergencyPhone).toBe('+60111234567')
      expect(data.emergencyRelation).toBe('Parent')
    })
  })

  // ─── PATCH /api/patients/[patientId] — Enhanced ───
  describe('PATCH /api/patients/[patientId] — Enhanced', () => {
    let PATCH: typeof import('../../patients/[patientId]/route').PATCH

    beforeEach(async () => {
      const mod = await import('../../patients/[patientId]/route')
      PATCH = mod.PATCH
    })

    it('21. updates new fields (icNumber, occupation, etc.)', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/patients/${patientActiveId}`, {
          icNumber: '900101-14-1234', occupation: 'Nurse', race: 'Indian',
        }),
        { params: Promise.resolve({ patientId: patientActiveId }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.patient.icNumber).toBe('900101-14-1234')
      expect(data.patient.occupation).toBe('Nurse')
      expect(data.patient.race).toBe('Indian')
    })

    it('22. updates status to inactive', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/patients/${patientActiveId}`, { status: 'inactive' }),
        { params: Promise.resolve({ patientId: patientActiveId }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.patient.status).toBe('inactive')
      // Restore
      await prisma.patient.update({ where: { id: patientActiveId }, data: { status: 'active' } })
    })

    it('23. updates status to discharged', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/patients/${patientActiveId}`, { status: 'discharged' }),
        { params: Promise.resolve({ patientId: patientActiveId }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.patient.status).toBe('discharged')
      // Restore
      await prisma.patient.update({ where: { id: patientActiveId }, data: { status: 'active' } })
    })

    it('24. validates IC number on update', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/patients/${patientActiveId}`, { icNumber: 'bad-ic' }),
        { params: Promise.resolve({ patientId: patientActiveId }) }
      )
      expect(res.status).toBe(400)
    })

    it('25. updates address fields', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/patients/${patientActiveId}`, {
          addressLine1: '42 Jalan Sultan', city: 'George Town', state: 'Pulau Pinang', postcode: '10200',
        }),
        { params: Promise.resolve({ patientId: patientActiveId }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.patient.addressLine1).toBe('42 Jalan Sultan')
      expect(data.patient.city).toBe('George Town')
    })

    it('26. updates emergency contact fields', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/patients/${patientActiveId}`, {
          emergencyName: 'Mei Ling', emergencyPhone: '+60199998888', emergencyRelation: 'Sibling',
        }),
        { params: Promise.resolve({ patientId: patientActiveId }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.patient.emergencyName).toBe('Mei Ling')
      expect(data.patient.emergencyRelation).toBe('Sibling')
    })

    it('27. can reassign doctor (OWNER)', async () => {
      mockAuth.mockResolvedValue({ user: { id: ownerId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/patients/${patientWithIcId}`, { doctorId: doctor2Id }),
        { params: Promise.resolve({ patientId: patientWithIcId }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.patient.doctorId).toBe(doctor2Id)
      // Restore
      await prisma.patient.update({ where: { id: patientWithIcId }, data: { doctorId } })
    })

    it('28. updates allergies and medicalHistory', async () => {
      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await PATCH(
        createRequest('PATCH', `/api/patients/${patientActiveId}`, {
          allergies: 'Latex, NSAIDs', medicalHistory: 'Chronic lower back pain since 2020',
        }),
        { params: Promise.resolve({ patientId: patientActiveId }) }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.patient.allergies).toBe('Latex, NSAIDs')
      expect(data.patient.medicalHistory).toBe('Chronic lower back pain since 2020')
    })
  })

  // ─── DELETE /api/patients/[patientId] — Cascade ───
  describe('DELETE /api/patients/[patientId] — Cascade', () => {
    let DELETE: typeof import('../../patients/[patientId]/route').DELETE

    beforeEach(async () => {
      const mod = await import('../../patients/[patientId]/route')
      DELETE = mod.DELETE
    })

    it('29. delete removes patient + visits + xrays (cascade)', async () => {
      // Create patient with a visit and xray
      const temp = await prisma.patient.create({
        data: { firstName: 'Cascade', lastName: 'Test', branchId, doctorId },
      })
      await prisma.visit.create({
        data: { patientId: temp.id, doctorId, visitDate: new Date() },
      })
      await prisma.xray.create({
        data: {
          patientId: temp.id, uploadedById: doctorId,
          fileUrl: 'https://example.com/test.jpg', fileName: 'test.jpg',
          fileSize: 1000, mimeType: 'image/jpeg',
        },
      })

      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await DELETE(
        createRequest('DELETE', `/api/patients/${temp.id}`),
        { params: Promise.resolve({ patientId: temp.id }) }
      )
      expect(res.status).toBe(200)

      // Verify cascade
      const visits = await prisma.visit.findMany({ where: { patientId: temp.id } })
      expect(visits).toHaveLength(0)
      const xrays = await prisma.xray.findMany({ where: { patientId: temp.id } })
      expect(xrays).toHaveLength(0)
    })

    it('30. delete removes appointments and documents (cascade)', async () => {
      const temp = await prisma.patient.create({
        data: { firstName: 'Cascade2', lastName: 'Test', branchId, doctorId },
      })
      await prisma.appointment.create({
        data: {
          patientId: temp.id, branchId, doctorId,
          dateTime: new Date(), duration: 30,
        },
      })
      await prisma.patientDocument.create({
        data: {
          patientId: temp.id, uploadedById: doctorId,
          title: 'Test Doc', fileUrl: 'https://example.com/doc.pdf',
          fileName: 'doc.pdf', fileSize: 500, mimeType: 'application/pdf',
        },
      })

      mockAuth.mockResolvedValue({ user: { id: doctorId } })
      const res = await DELETE(
        createRequest('DELETE', `/api/patients/${temp.id}`),
        { params: Promise.resolve({ patientId: temp.id }) }
      )
      expect(res.status).toBe(200)

      const appts = await prisma.appointment.findMany({ where: { patientId: temp.id } })
      expect(appts).toHaveLength(0)
      const docs = await prisma.patientDocument.findMany({ where: { patientId: temp.id } })
      expect(docs).toHaveLength(0)
    })
  })
})
