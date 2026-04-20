import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// ─── Mock auth ───
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

// ─── Helpers ───
const TEST_PREFIX = `test-ptdtl-${Date.now()}`

function createRequest(method: string, url: string, body?: Record<string, unknown>): NextRequest {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) init.body = JSON.stringify(body)
  return new NextRequest(`http://localhost:3000${url}`, init)
}

// ─── Test data IDs ───
let ownerId: string
let doctorId: string
let doctor2Id: string
let outsiderId: string
let branchId: string
let outsiderBranchId: string
let patientId: string
let visit1Id: string
let visit2Id: string
let visit3Id: string
let appt1Id: string
let appt2Id: string
let apptPastId: string

// ─── Setup ───
beforeAll(async () => {
  // Create users
  const owner = await prisma.user.create({
    data: { email: `${TEST_PREFIX}-owner@test.com`, name: 'Test Owner' },
  })
  const doctor = await prisma.user.create({
    data: { email: `${TEST_PREFIX}-doctor@test.com`, name: 'Dr. Test' },
  })
  const doctor2 = await prisma.user.create({
    data: { email: `${TEST_PREFIX}-doctor2@test.com`, name: 'Dr. Other' },
  })
  const outsider = await prisma.user.create({
    data: { email: `${TEST_PREFIX}-outsider@test.com`, name: 'Outsider' },
  })
  ownerId = owner.id
  doctorId = doctor.id
  doctor2Id = doctor2.id
  outsiderId = outsider.id

  // Create branches
  const branch = await prisma.branch.create({
    data: { name: `${TEST_PREFIX} Branch` },
  })
  const outsiderBranch = await prisma.branch.create({
    data: { name: `${TEST_PREFIX} Outsider Branch` },
  })
  branchId = branch.id
  outsiderBranchId = outsiderBranch.id

  // Memberships
  await prisma.branchMember.createMany({
    data: [
      { userId: ownerId, branchId, role: 'OWNER' },
      { userId: doctorId, branchId, role: 'DOCTOR' },
      { userId: doctor2Id, branchId, role: 'DOCTOR' },
      { userId: outsiderId, branchId: outsiderBranchId, role: 'OWNER' },
    ],
  })

  // Create patient assigned to doctor
  const patient = await prisma.patient.create({
    data: {
      firstName: 'Ahmad',
      lastName: 'Rahman',
      email: 'ahmad@test.com',
      phone: '+60111112001',
      gender: 'Male',
      status: 'active',
      branchId,
      doctorId,
    },
  })
  patientId = patient.id

  // Create visits with different types
  const v1 = await prisma.visit.create({
    data: {
      visitDate: new Date(),
      visitType: 'initial',
      subjective: 'Lower back pain',
      assessment: 'Lumbar subluxation',
      patientId,
      doctorId,
    },
  })
  const v2 = await prisma.visit.create({
    data: {
      visitDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      visitType: 'follow_up',
      subjective: 'Pain improving',
      assessment: 'Good progress',
      patientId,
      doctorId,
    },
  })
  const v3 = await prisma.visit.create({
    data: {
      visitDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      visitType: 'follow_up',
      subjective: 'Neck stiffness',
      assessment: 'Cervical subluxation',
      patientId,
      doctorId,
    },
  })
  visit1Id = v1.id
  visit2Id = v2.id
  visit3Id = v3.id

  // Create questionnaire for visit2
  await prisma.visitQuestionnaire.create({
    data: {
      visitId: visit2Id,
      painLevel: 4,
      mobilityScore: 7,
      sleepQuality: 6,
      dailyFunction: 8,
      overallImprovement: 7,
      patientComments: 'Feeling much better',
    },
  })

  // Create appointments: one future, one past, one further future
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + 3)
  futureDate.setHours(10, 0, 0, 0)

  const futureDate2 = new Date()
  futureDate2.setDate(futureDate2.getDate() + 7)
  futureDate2.setHours(14, 0, 0, 0)

  const pastDate = new Date()
  pastDate.setDate(pastDate.getDate() - 5)
  pastDate.setHours(9, 0, 0, 0)

  const a1 = await prisma.appointment.create({
    data: {
      dateTime: futureDate,
      duration: 30,
      status: 'SCHEDULED',
      patientId,
      branchId,
      doctorId,
    },
  })
  const a2 = await prisma.appointment.create({
    data: {
      dateTime: futureDate2,
      duration: 45,
      status: 'SCHEDULED',
      patientId,
      branchId,
      doctorId,
    },
  })
  const aPast = await prisma.appointment.create({
    data: {
      dateTime: pastDate,
      duration: 30,
      status: 'COMPLETED',
      patientId,
      branchId,
      doctorId,
    },
  })
  appt1Id = a1.id
  appt2Id = a2.id
  apptPastId = aPast.id
})

afterAll(async () => {
  await prisma.appointment.deleteMany({ where: { id: { in: [appt1Id, appt2Id, apptPastId] } } })
  await prisma.visitQuestionnaire.deleteMany({ where: { visitId: { in: [visit1Id, visit2Id, visit3Id] } } })
  await prisma.visit.deleteMany({ where: { id: { in: [visit1Id, visit2Id, visit3Id] } } })
  await prisma.patient.deleteMany({ where: { id: patientId } })
  await prisma.branchMember.deleteMany({ where: { branchId: { in: [branchId, outsiderBranchId] } } })
  await prisma.branch.deleteMany({ where: { id: { in: [branchId, outsiderBranchId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, doctorId, doctor2Id, outsiderId] } } })
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ═══════════════════════════════════════
// GET /api/patients/[patientId]?include=detail
// ═══════════════════════════════════════
describe('GET /api/patients/[patientId]?include=detail', () => {
  let GET: typeof import('../../app/api/patients/[patientId]/route').GET

  beforeEach(async () => {
    const mod = await import('../../app/api/patients/[patientId]/route')
    GET = mod.GET
  })

  it('1. returns recoveryTrend, nextAppointment, visitsByType when include=detail', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await GET(
      createRequest('GET', `/api/patients/${patientId}?include=detail`),
      { params: Promise.resolve({ patientId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.patient.recoveryTrend).toBeDefined()
    expect(typeof json.patient.recoveryTrend).toBe('number')
    expect(json.patient.nextAppointment).toBeDefined()
    expect(json.patient.visitsByType).toBeDefined()
    expect(typeof json.patient.visitsByType.initial).toBe('number')
    expect(typeof json.patient.visitsByType.follow_up).toBe('number')
  })

  it('2. returns null recoveryTrend when no questionnaires exist for a patient without questionnaires', async () => {
    // Create a temp patient with a visit but no questionnaire
    const tempPatient = await prisma.patient.create({
      data: {
        firstName: 'NoQ', lastName: 'Patient',
        status: 'active', branchId, doctorId,
      },
    })
    const tempVisit = await prisma.visit.create({
      data: {
        visitDate: new Date(),
        visitType: 'initial',
        subjective: 'Test visit',
        patientId: tempPatient.id,
        doctorId,
      },
    })

    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await GET(
      createRequest('GET', `/api/patients/${tempPatient.id}?include=detail`),
      { params: Promise.resolve({ patientId: tempPatient.id }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.patient.recoveryTrend).toBeNull()

    // Cleanup
    await prisma.visit.delete({ where: { id: tempVisit.id } })
    await prisma.patient.delete({ where: { id: tempPatient.id } })
  })
})

// ═══════════════════════════════════════
// GET /api/patients/[patientId]/visits
// ═══════════════════════════════════════
describe('GET /api/patients/[patientId]/visits', () => {
  let GET: typeof import('../../app/api/patients/[patientId]/visits/route').GET

  beforeEach(async () => {
    const mod = await import('../../app/api/patients/[patientId]/visits/route')
    GET = mod.GET
  })

  it('3. returns visits with questionnaire data', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await GET(
      createRequest('GET', `/api/patients/${patientId}/visits`),
      { params: Promise.resolve({ patientId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.visits.length).toBeGreaterThanOrEqual(3)
    // visit2 has a questionnaire
    const visitWithQ = json.visits.find((v: { id: string }) => v.id === visit2Id)
    expect(visitWithQ).toBeDefined()
    expect(visitWithQ.questionnaire).not.toBeNull()
    expect(visitWithQ.questionnaire.painLevel).toBe(4)
    expect(visitWithQ.questionnaire.mobilityScore).toBe(7)
    expect(visitWithQ.questionnaire.overallImprovement).toBe(7)
  })

  it('4. filters by visit type (?type=follow_up)', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await GET(
      createRequest('GET', `/api/patients/${patientId}/visits?type=follow_up`),
      { params: Promise.resolve({ patientId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.visits.length).toBeGreaterThanOrEqual(2)
    for (const v of json.visits) {
      expect(v.visitType).toBe('follow_up')
    }
  })

  it('5. sorts by oldest (?sort=oldest)', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await GET(
      createRequest('GET', `/api/patients/${patientId}/visits?sort=oldest`),
      { params: Promise.resolve({ patientId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    if (json.visits.length >= 2) {
      const d1 = new Date(json.visits[0].visitDate).getTime()
      const d2 = new Date(json.visits[1].visitDate).getTime()
      expect(d1).toBeLessThanOrEqual(d2)
    }
  })

  it('6. unauthorized returns 401', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(
      createRequest('GET', `/api/patients/${patientId}/visits`),
      { params: Promise.resolve({ patientId }) }
    )
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════
// POST /api/patients/[patientId]/visits
// ═══════════════════════════════════════
describe('POST /api/patients/[patientId]/visits', () => {
  let POST: typeof import('../../app/api/patients/[patientId]/visits/route').POST
  const createdVisitIds: string[] = []

  beforeEach(async () => {
    const mod = await import('../../app/api/patients/[patientId]/visits/route')
    POST = mod.POST
  })

  afterAll(async () => {
    if (createdVisitIds.length > 0) {
      await prisma.visitQuestionnaire.deleteMany({ where: { visitId: { in: createdVisitIds } } })
      await prisma.visit.deleteMany({ where: { id: { in: createdVisitIds } } })
    }
  })

  it('7. creates visit with questionnaire', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await POST(
      createRequest('POST', `/api/patients/${patientId}/visits`, {
        visitType: 'follow_up',
        subjective: 'Feeling better',
        assessment: 'Improving',
        questionnaire: {
          painLevel: 3,
          mobilityScore: 8,
          sleepQuality: 7,
          dailyFunction: 9,
          overallImprovement: 8,
          patientComments: 'Great progress',
        },
      }),
      { params: Promise.resolve({ patientId }) }
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    createdVisitIds.push(json.visit.id)
    expect(json.visit.visitType).toBe('follow_up')
    expect(json.visit.subjective).toBe('Feeling better')
    expect(json.visit.questionnaire).not.toBeNull()
    expect(json.visit.questionnaire.painLevel).toBe(3)
    expect(json.visit.questionnaire.overallImprovement).toBe(8)
    expect(json.visit.questionnaire.patientComments).toBe('Great progress')
  })

  it('8. creates visit without questionnaire', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await POST(
      createRequest('POST', `/api/patients/${patientId}/visits`, {
        visitType: 'initial',
        subjective: 'First visit',
        chiefComplaint: 'Lower back pain',
      }),
      { params: Promise.resolve({ patientId }) }
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    createdVisitIds.push(json.visit.id)
    expect(json.visit.visitType).toBe('initial')
    expect(json.visit.questionnaire).toBeNull()
    expect(json.visit.chiefComplaint).toBe('Lower back pain')
  })

  it('9. validates questionnaire scores (0-10 range) — score of 11 returns 400', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await POST(
      createRequest('POST', `/api/patients/${patientId}/visits`, {
        visitType: 'follow_up',
        questionnaire: {
          painLevel: 11,
          mobilityScore: 5,
          sleepQuality: 5,
          dailyFunction: 5,
          overallImprovement: 5,
        },
      }),
      { params: Promise.resolve({ patientId }) }
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('painLevel')
  })

  it('10. unauthorized returns 401', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(
      createRequest('POST', `/api/patients/${patientId}/visits`, {
        visitType: 'follow_up',
        subjective: 'Should not work',
      }),
      { params: Promise.resolve({ patientId }) }
    )
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════
// PUT /api/patients/[patientId]/visits/[visitId]
// ═══════════════════════════════════════
describe('PUT /api/patients/[patientId]/visits/[visitId]', () => {
  let PUT: typeof import('../../app/api/patients/[patientId]/visits/[visitId]/route').PUT

  beforeEach(async () => {
    const mod = await import('../../app/api/patients/[patientId]/visits/[visitId]/route')
    PUT = mod.PUT
  })

  it('11. updates visit fields', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await PUT(
      createRequest('PUT', `/api/patients/${patientId}/visits/${visit1Id}`, {
        subjective: 'Updated subjective note',
        assessment: 'Updated assessment',
        treatmentNotes: 'Adjusted C1-C2',
      }),
      { params: Promise.resolve({ patientId, visitId: visit1Id }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.visit.subjective).toBe('Updated subjective note')
    expect(json.visit.assessment).toBe('Updated assessment')
    expect(json.visit.treatmentNotes).toBe('Adjusted C1-C2')
  })

  it('12. updates questionnaire scores (upsert)', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    // visit1 has no questionnaire yet, so this should create one via upsert
    const res = await PUT(
      createRequest('PUT', `/api/patients/${patientId}/visits/${visit1Id}`, {
        questionnaire: {
          painLevel: 2,
          mobilityScore: 9,
          sleepQuality: 8,
          dailyFunction: 9,
          overallImprovement: 9,
          patientComments: 'Almost fully recovered',
        },
      }),
      { params: Promise.resolve({ patientId, visitId: visit1Id }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.visit.questionnaire).not.toBeNull()
    expect(json.visit.questionnaire.painLevel).toBe(2)
    expect(json.visit.questionnaire.overallImprovement).toBe(9)
    expect(json.visit.questionnaire.patientComments).toBe('Almost fully recovered')
  })

  it('13. wrong doctor (non-OWNER) returns 403', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctor2Id } })
    const res = await PUT(
      createRequest('PUT', `/api/patients/${patientId}/visits/${visit1Id}`, {
        subjective: 'Should not work',
      }),
      { params: Promise.resolve({ patientId, visitId: visit1Id }) }
    )
    expect(res.status).toBe(403)
  })
})

// ═══════════════════════════════════════
// DELETE /api/patients/[patientId]/visits/[visitId]
// ═══════════════════════════════════════
describe('DELETE /api/patients/[patientId]/visits/[visitId]', () => {
  let DELETE: typeof import('../../app/api/patients/[patientId]/visits/[visitId]/route').DELETE

  beforeEach(async () => {
    const mod = await import('../../app/api/patients/[patientId]/visits/[visitId]/route')
    DELETE = mod.DELETE
  })

  it('14. deletes visit and cascades to questionnaire', async () => {
    // Create a disposable visit with questionnaire
    const tempVisit = await prisma.visit.create({
      data: {
        visitDate: new Date(),
        visitType: 'follow_up',
        subjective: 'Temp visit to delete',
        patientId,
        doctorId,
      },
    })
    const tempQ = await prisma.visitQuestionnaire.create({
      data: {
        visitId: tempVisit.id,
        painLevel: 5,
        mobilityScore: 5,
        sleepQuality: 5,
        dailyFunction: 5,
        overallImprovement: 5,
      },
    })

    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await DELETE(
      createRequest('DELETE', `/api/patients/${patientId}/visits/${tempVisit.id}`),
      { params: Promise.resolve({ patientId, visitId: tempVisit.id }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)

    // Verify cascade: visit deleted
    const dbVisit = await prisma.visit.findUnique({ where: { id: tempVisit.id } })
    expect(dbVisit).toBeNull()

    // Verify cascade: questionnaire deleted
    const dbQ = await prisma.visitQuestionnaire.findUnique({ where: { id: tempQ.id } })
    expect(dbQ).toBeNull()
  })

  it('15. wrong doctor (non-OWNER) returns 403', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctor2Id } })
    const res = await DELETE(
      createRequest('DELETE', `/api/patients/${patientId}/visits/${visit3Id}`),
      { params: Promise.resolve({ patientId, visitId: visit3Id }) }
    )
    expect(res.status).toBe(403)
  })
})

// ═══════════════════════════════════════
// GET /api/patients/[patientId]/appointments
// ═══════════════════════════════════════
describe('GET /api/patients/[patientId]/appointments', () => {
  let GET: typeof import('../../app/api/patients/[patientId]/appointments/route').GET

  beforeEach(async () => {
    const mod = await import('../../app/api/patients/[patientId]/appointments/route')
    GET = mod.GET
  })

  it('16. returns future appointments when upcoming=true', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await GET(
      createRequest('GET', `/api/patients/${patientId}/appointments?upcoming=true`),
      { params: Promise.resolve({ patientId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    // Should only include future SCHEDULED/CHECKED_IN appointments
    expect(json.appointments.length).toBeGreaterThanOrEqual(2)
    for (const a of json.appointments) {
      expect(new Date(a.dateTime).getTime()).toBeGreaterThanOrEqual(Date.now() - 60000)
      expect(['SCHEDULED', 'CHECKED_IN']).toContain(a.status)
    }
  })

  it('17. returns all appointments without filter', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await GET(
      createRequest('GET', `/api/patients/${patientId}/appointments`),
      { params: Promise.resolve({ patientId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    // Should include both past and future appointments
    expect(json.appointments.length).toBeGreaterThanOrEqual(3)
    // Verify structure
    expect(json.appointments[0].id).toBeDefined()
    expect(json.appointments[0].dateTime).toBeDefined()
    expect(json.appointments[0].duration).toBeDefined()
    expect(json.appointments[0].status).toBeDefined()
    expect(json.appointments[0].doctor).toBeDefined()
  })
})
