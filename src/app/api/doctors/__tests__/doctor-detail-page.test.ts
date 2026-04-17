import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// ─── Mock auth ───
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

// ─── Helpers ───
const TEST_PREFIX = `test-drdtl-${Date.now()}`

function createRequest(method: string, url: string): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Test data IDs ───
let ownerId: string
let doctorId: string
let outsiderId: string
let branchId: string
let outsiderBranchId: string
let patient1Id: string
let patient2Id: string
let patient3Id: string
let visit1Id: string
let visit2Id: string
let appt1Id: string
let appt2Id: string

// ─── Setup ───
beforeAll(async () => {
  // Create users
  const owner = await prisma.user.create({
    data: { email: `${TEST_PREFIX}-owner@test.com`, name: 'Test Owner' },
  })
  const doctor = await prisma.user.create({
    data: { email: `${TEST_PREFIX}-doctor@test.com`, name: 'Test Doctor' },
  })
  const outsider = await prisma.user.create({
    data: { email: `${TEST_PREFIX}-outsider@test.com`, name: 'Outsider' },
  })
  ownerId = owner.id
  doctorId = doctor.id
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
      { userId: outsiderId, branchId: outsiderBranchId, role: 'OWNER' },
    ],
  })

  // Create doctor profile
  await prisma.doctorProfile.create({
    data: {
      userId: doctorId,
      licenseNumber: 'DC-TEST-001',
      specialties: ['Gonstead', 'Sports'],
      yearsExperience: 8,
      education: 'RMIT University',
      workingSchedule: {
        mon: { start: '09:00', end: '17:00' },
        tue: { start: '09:00', end: '17:00' },
        wed: null,
        thu: { start: '09:00', end: '17:00' },
        fri: { start: '09:00', end: '14:00' },
      },
    },
  })

  // Create patients assigned to doctor
  const p1 = await prisma.patient.create({
    data: {
      firstName: 'Ahmad',
      lastName: 'Test',
      icNumber: '850315-14-5523',
      phone: '+60111112001',
      gender: 'Male',
      status: 'active',
      branchId,
      doctorId,
    },
  })
  const p2 = await prisma.patient.create({
    data: {
      firstName: 'Mei',
      lastName: 'Ling',
      email: 'mei@test.com',
      status: 'active',
      branchId,
      doctorId,
    },
  })
  const p3 = await prisma.patient.create({
    data: {
      firstName: 'Inactive',
      lastName: 'Patient',
      status: 'inactive',
      branchId,
      doctorId,
    },
  })
  patient1Id = p1.id
  patient2Id = p2.id
  patient3Id = p3.id

  // Create visits
  const v1 = await prisma.visit.create({
    data: {
      visitDate: new Date(),
      subjective: 'Lower back pain improved',
      assessment: 'Improving lumbar subluxation',
      patientId: patient1Id,
      doctorId,
    },
  })
  const v2 = await prisma.visit.create({
    data: {
      visitDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      subjective: 'Neck stiffness',
      assessment: 'Cervical subluxation C2-C3',
      patientId: patient2Id,
      doctorId,
    },
  })
  visit1Id = v1.id
  visit2Id = v2.id

  // Create appointments for today
  const today = new Date()
  today.setHours(10, 0, 0, 0)
  const today2 = new Date()
  today2.setHours(14, 0, 0, 0)

  const a1 = await prisma.appointment.create({
    data: {
      dateTime: today,
      duration: 30,
      status: 'SCHEDULED',
      patientId: patient1Id,
      branchId,
      doctorId,
    },
  })
  const a2 = await prisma.appointment.create({
    data: {
      dateTime: today2,
      duration: 45,
      status: 'CHECKED_IN',
      patientId: patient2Id,
      branchId,
      doctorId,
    },
  })
  appt1Id = a1.id
  appt2Id = a2.id
})

afterAll(async () => {
  await prisma.appointment.deleteMany({ where: { id: { in: [appt1Id, appt2Id] } } })
  await prisma.visit.deleteMany({ where: { id: { in: [visit1Id, visit2Id] } } })
  await prisma.patient.deleteMany({ where: { id: { in: [patient1Id, patient2Id, patient3Id] } } })
  await prisma.doctorProfile.deleteMany({ where: { userId: { in: [doctorId] } } })
  await prisma.branchMember.deleteMany({ where: { branchId: { in: [branchId, outsiderBranchId] } } })
  await prisma.branch.deleteMany({ where: { id: { in: [branchId, outsiderBranchId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, doctorId, outsiderId] } } })
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ═══════════════════════════════════════
// GET /api/doctors/[userId]?include=detail
// ═══════════════════════════════════════
describe('GET /api/doctors/[userId]?include=detail', () => {
  let GET: typeof import('../../doctors/[userId]/route').GET

  beforeEach(async () => {
    const mod = await import('../../doctors/[userId]/route')
    GET = mod.GET
  })

  it('1. returns extended stats with ?include=detail', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}?include=detail`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.doctor.stats.patientCount).toBeGreaterThanOrEqual(3)
    expect(typeof json.doctor.stats.visitsThisMonth).toBe('number')
    expect(typeof json.doctor.stats.avgVisitsPerPatient).toBe('number')
  })

  it('2. does not include extended stats without ?include=detail', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.doctor.stats.visitsThisMonth).toBeUndefined()
    expect(json.doctor.stats.avgVisitsPerPatient).toBeUndefined()
  })
})

// ═══════════════════════════════════════
// GET /api/doctors/[userId]/appointments
// ═══════════════════════════════════════
describe('GET /api/doctors/[userId]/appointments', () => {
  let GET: typeof import('../../doctors/[userId]/appointments/route').GET

  beforeEach(async () => {
    const mod = await import('../../doctors/[userId]/appointments/route')
    GET = mod.GET
  })

  it('3. returns today appointments by default', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/appointments`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.appointments.length).toBe(2)
    expect(json.appointments[0].patient).not.toBeNull()
    expect(json.appointments[0].duration).toBeDefined()
    expect(json.appointments[0].status).toBeDefined()
  })

  it('4. returns appointments for ?date=today', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/appointments?date=today`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.appointments.length).toBe(2)
  })

  it('5. returns empty for future date', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/appointments?date=${futureDate.toISOString()}`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.appointments.length).toBe(0)
  })

  it('6. returns 401 if unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/appointments`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(401)
  })

  it('7. returns 403 if no shared branch', async () => {
    mockAuth.mockResolvedValue({ user: { id: outsiderId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/appointments`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(403)
  })

  it('8. returns 400 for invalid date', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/appointments?date=not-a-date`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(400)
  })

  it('9. appointments are ordered by time', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/appointments`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    if (json.appointments.length >= 2) {
      const t1 = new Date(json.appointments[0].dateTime).getTime()
      const t2 = new Date(json.appointments[1].dateTime).getTime()
      expect(t1).toBeLessThanOrEqual(t2)
    }
  })
})

// ═══════════════════════════════════════
// GET /api/doctors/[userId]/patients
// ═══════════════════════════════════════
describe('GET /api/doctors/[userId]/patients', () => {
  let GET: typeof import('../../doctors/[userId]/patients/route').GET

  beforeEach(async () => {
    const mod = await import('../../doctors/[userId]/patients/route')
    GET = mod.GET
  })

  it('10. returns paginated patients', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/patients`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.patients.length).toBeGreaterThanOrEqual(3)
    expect(json.total).toBeGreaterThanOrEqual(3)
    expect(json.page).toBe(1)
    expect(json.totalPages).toBeGreaterThanOrEqual(1)
  })

  it('11. filters by search term', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/patients?search=Ahmad`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.patients.length).toBeGreaterThanOrEqual(1)
    expect(json.patients[0].firstName).toBe('Ahmad')
  })

  it('12. filters by status=active', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/patients?status=active`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    // Should exclude the inactive patient
    for (const p of json.patients) {
      expect(p.status).toBe('active')
    }
  })

  it('13. filters by status=inactive', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/patients?status=inactive`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.patients.length).toBeGreaterThanOrEqual(1)
    for (const p of json.patients) {
      expect(p.status).toBe('inactive')
    }
  })

  it('14. paginates correctly', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/patients?page=1&limit=2`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.patients.length).toBeLessThanOrEqual(2)
    expect(json.limit).toBe(2)
  })

  it('15. returns 401 if unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/patients`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(401)
  })

  it('16. returns 403 if no shared branch', async () => {
    mockAuth.mockResolvedValue({ user: { id: outsiderId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/patients`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(403)
  })

  it('17. includes visit and xray counts per patient', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/patients`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    for (const p of json.patients) {
      expect(typeof p.visitCount).toBe('number')
      expect(typeof p.xrayCount).toBe('number')
    }
  })
})

// ═══════════════════════════════════════
// GET /api/doctors/[userId]/visits
// ═══════════════════════════════════════
describe('GET /api/doctors/[userId]/visits', () => {
  let GET: typeof import('../../doctors/[userId]/visits/route').GET

  beforeEach(async () => {
    const mod = await import('../../doctors/[userId]/visits/route')
    GET = mod.GET
  })

  it('18. returns recent visits (default limit=5)', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/visits`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.visits.length).toBeGreaterThanOrEqual(2)
    expect(json.visits[0].patient).not.toBeNull()
    expect(json.visits[0].assessment).toBeDefined()
  })

  it('19. respects limit parameter', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/visits?limit=1`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.visits.length).toBe(1)
  })

  it('20. visits are ordered by date descending', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/visits`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    if (json.visits.length >= 2) {
      const d1 = new Date(json.visits[0].visitDate).getTime()
      const d2 = new Date(json.visits[1].visitDate).getTime()
      expect(d1).toBeGreaterThanOrEqual(d2)
    }
  })

  it('21. returns 401 if unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/visits`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(401)
  })

  it('22. returns 403 if no shared branch', async () => {
    mockAuth.mockResolvedValue({ user: { id: outsiderId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}/visits`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(403)
  })

  it('23. returns 404 if user not found', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/nonexistent-id/visits`),
      { params: Promise.resolve({ userId: 'nonexistent-id' }) }
    )
    expect(res.status).toBe(404)
  })
})
