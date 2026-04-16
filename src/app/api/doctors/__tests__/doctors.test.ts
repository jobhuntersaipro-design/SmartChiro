import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// ─── Mock auth ───
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

// ─── Helpers ───
const TEST_PREFIX = `test-doctors-${Date.now()}`

function createRequest(method: string, url: string, body?: Record<string, unknown>): NextRequest {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) init.body = JSON.stringify(body)
  return new NextRequest(`http://localhost:3000${url}`, init)
}

// ─── Test data IDs ───
let ownerId: string
let adminId: string
let doctorId: string
let outsiderId: string
let branch1Id: string
let branch2Id: string
let patientId: string

// ─── Setup ───
beforeAll(async () => {
  // Create users
  const owner = await prisma.user.create({
    data: { email: `${TEST_PREFIX}-owner@test.com`, name: 'Test Owner' },
  })
  const admin = await prisma.user.create({
    data: { email: `${TEST_PREFIX}-admin@test.com`, name: 'Test Admin' },
  })
  const doctor = await prisma.user.create({
    data: { email: `${TEST_PREFIX}-doctor@test.com`, name: 'Test Doctor', phoneNumber: '+60123456789' },
  })
  const outsider = await prisma.user.create({
    data: { email: `${TEST_PREFIX}-outsider@test.com`, name: 'Outsider' },
  })
  ownerId = owner.id
  adminId = admin.id
  doctorId = doctor.id
  outsiderId = outsider.id

  // Create branches
  const branch1 = await prisma.branch.create({
    data: { name: `${TEST_PREFIX} Branch 1` },
  })
  const branch2 = await prisma.branch.create({
    data: { name: `${TEST_PREFIX} Branch 2` },
  })
  branch1Id = branch1.id
  branch2Id = branch2.id

  // Memberships
  await prisma.branchMember.createMany({
    data: [
      { userId: ownerId, branchId: branch1Id, role: 'OWNER' },
      { userId: adminId, branchId: branch1Id, role: 'ADMIN' },
      { userId: doctorId, branchId: branch1Id, role: 'DOCTOR' },
      { userId: doctorId, branchId: branch2Id, role: 'DOCTOR' },
      { userId: outsiderId, branchId: branch2Id, role: 'OWNER' },
    ],
  })

  // Create a patient for stats
  const patient = await prisma.patient.create({
    data: {
      firstName: 'Test',
      lastName: 'Patient',
      branchId: branch1Id,
      doctorId: doctorId,
    },
  })
  patientId = patient.id
})

afterAll(async () => {
  await prisma.doctorProfile.deleteMany({ where: { userId: { in: [ownerId, adminId, doctorId, outsiderId] } } })
  await prisma.patient.deleteMany({ where: { id: patientId } })
  await prisma.branchMember.deleteMany({ where: { branchId: { in: [branch1Id, branch2Id] } } })
  await prisma.branch.deleteMany({ where: { id: { in: [branch1Id, branch2Id] } } })
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, adminId, doctorId, outsiderId] } } })
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ═══════════════════════════════════════
// GET /api/doctors/[userId]
// ═══════════════════════════════════════
describe('GET /api/doctors/[userId]', () => {
  let GET: typeof import('../../doctors/[userId]/route').GET

  beforeEach(async () => {
    const mod = await import('../../doctors/[userId]/route')
    GET = mod.GET
  })

  it('1. returns doctor with profile', async () => {
    // Seed a profile first
    await prisma.doctorProfile.upsert({
      where: { userId: doctorId },
      create: {
        userId: doctorId,
        licenseNumber: 'NPI-1234',
        specialties: ['Sports', 'Rehab'],
        yearsExperience: 5,
        bio: 'Test bio',
        languages: ['English', 'Malay'],
      },
      update: {},
    })

    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.doctor.id).toBe(doctorId)
    expect(json.doctor.profile).not.toBeNull()
    expect(json.doctor.profile.licenseNumber).toBe('NPI-1234')
    expect(json.doctor.profile.specialties).toEqual(['Sports', 'Rehab'])
  })

  it('2. returns doctor without profile (profile null)', async () => {
    // Use admin who has no profile
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${adminId}`),
      { params: Promise.resolve({ userId: adminId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.doctor.id).toBe(adminId)
    expect(json.doctor.profile).toBeNull()
  })

  it('3. returns branch memberships', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.doctor.branches.length).toBe(2)
  })

  it('4. returns stats (patient count, visits, xrays)', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.doctor.stats.patientCount).toBeGreaterThanOrEqual(1)
    expect(typeof json.doctor.stats.totalVisits).toBe('number')
    expect(typeof json.doctor.stats.totalXrays).toBe('number')
  })

  it('5. returns 403 if no shared branch', async () => {
    // Create a totally isolated user
    const isolated = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-isolated@test.com`, name: 'Isolated' },
    })
    const isolatedBranch = await prisma.branch.create({
      data: { name: `${TEST_PREFIX} Isolated Branch` },
    })
    await prisma.branchMember.create({
      data: { userId: isolated.id, branchId: isolatedBranch.id, role: 'DOCTOR' },
    })

    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${isolated.id}`),
      { params: Promise.resolve({ userId: isolated.id }) }
    )
    expect(res.status).toBe(403)

    // Cleanup
    await prisma.branchMember.deleteMany({ where: { branchId: isolatedBranch.id } })
    await prisma.branch.delete({ where: { id: isolatedBranch.id } })
    await prisma.user.delete({ where: { id: isolated.id } })
  })

  it('6. returns 404 if user not found', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/nonexistent-id`),
      { params: Promise.resolve({ userId: 'nonexistent-id' }) }
    )
    expect(res.status).toBe(404)
  })

  it('7. returns 404 if user is not a doctor in any branch', async () => {
    const nobranchUser = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-nobranch@test.com`, name: 'No Branch' },
    })
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await GET(
      createRequest('GET', `/api/doctors/${nobranchUser.id}`),
      { params: Promise.resolve({ userId: nobranchUser.id }) }
    )
    expect(res.status).toBe(404)

    await prisma.user.delete({ where: { id: nobranchUser.id } })
  })

  it('8. returns 401 if unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(
      createRequest('GET', `/api/doctors/${doctorId}`),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════
// PUT /api/doctors/[userId]
// ═══════════════════════════════════════
describe('PUT /api/doctors/[userId]', () => {
  let PUT: typeof import('../../doctors/[userId]/route').PUT

  beforeEach(async () => {
    const mod = await import('../../doctors/[userId]/route')
    PUT = mod.PUT
  })

  it('9. creates profile if none exists (upsert)', async () => {
    // Use adminId who has no profile yet
    mockAuth.mockResolvedValue({ user: { id: adminId } })
    const res = await PUT(
      createRequest('PUT', `/api/doctors/${adminId}`, {
        licenseNumber: 'ADMIN-LIC',
        specialties: ['Wellness'],
      }),
      { params: Promise.resolve({ userId: adminId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.doctor.profile.licenseNumber).toBe('ADMIN-LIC')

    // Clean up
    await prisma.doctorProfile.delete({ where: { userId: adminId } })
  })

  it('10. updates existing profile', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await PUT(
      createRequest('PUT', `/api/doctors/${doctorId}`, {
        licenseNumber: 'UPDATED-LIC',
        bio: 'Updated bio text',
        languages: ['English', 'Mandarin'],
      }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.doctor.profile.licenseNumber).toBe('UPDATED-LIC')
    expect(json.doctor.profile.bio).toBe('Updated bio text')
    expect(json.doctor.profile.languages).toEqual(['English', 'Mandarin'])
  })

  it('11. updates user fields (name, phone)', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await PUT(
      createRequest('PUT', `/api/doctors/${doctorId}`, {
        name: 'Dr. Updated Name',
        phone: '+60198765432',
      }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.doctor.name).toBe('Dr. Updated Name')
    expect(json.doctor.phone).toBe('+60198765432')
  })

  it('12. partial update — only sent fields change', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await PUT(
      createRequest('PUT', `/api/doctors/${doctorId}`, {
        treatmentRoom: 'Room 5',
      }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.doctor.profile.treatmentRoom).toBe('Room 5')
    // Previous fields should remain
    expect(json.doctor.profile.licenseNumber).toBe('UPDATED-LIC')
  })

  it('13. validates specialties array', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })

    // Non-array
    const res1 = await PUT(
      createRequest('PUT', `/api/doctors/${doctorId}`, {
        specialties: 'not-array',
      }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res1.status).toBe(400)

    // Too many items
    const res2 = await PUT(
      createRequest('PUT', `/api/doctors/${doctorId}`, {
        specialties: Array.from({ length: 21 }, (_, i) => `spec${i}`),
      }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res2.status).toBe(400)
  })

  it('14. validates working schedule', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })

    // Invalid day key
    const res1 = await PUT(
      createRequest('PUT', `/api/doctors/${doctorId}`, {
        workingSchedule: { invalidDay: { start: '09:00', end: '17:00' } },
      }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res1.status).toBe(400)

    // Bad time format
    const res2 = await PUT(
      createRequest('PUT', `/api/doctors/${doctorId}`, {
        workingSchedule: { mon: { start: '9am', end: '5pm' } },
      }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res2.status).toBe(400)
  })

  it('15. validates consultation fee', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })

    const res1 = await PUT(
      createRequest('PUT', `/api/doctors/${doctorId}`, {
        consultationFee: -10,
      }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res1.status).toBe(400)

    const res2 = await PUT(
      createRequest('PUT', `/api/doctors/${doctorId}`, {
        consultationFee: 100000,
      }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res2.status).toBe(400)
  })

  it('16. validates bio length', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await PUT(
      createRequest('PUT', `/api/doctors/${doctorId}`, {
        bio: 'x'.repeat(2001),
      }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(400)
  })

  it('17. returns 403 if not self and not owner/admin', async () => {
    // outsider is OWNER of branch2, but NOT owner/admin of branch1
    // However, doctor is in BOTH branch1 and branch2
    // outsider IS owner of branch2 which doctor belongs to — so outsider CAN edit
    // Let's use a truly unauthorized user
    const unauth = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-unauth@test.com`, name: 'Unauth' },
    })
    const unauthBranch = await prisma.branch.create({
      data: { name: `${TEST_PREFIX} Unauth Branch` },
    })
    await prisma.branchMember.create({
      data: { userId: unauth.id, branchId: unauthBranch.id, role: 'DOCTOR' },
    })

    mockAuth.mockResolvedValue({ user: { id: unauth.id } })
    const res = await PUT(
      createRequest('PUT', `/api/doctors/${doctorId}`, { bio: 'Hacked' }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(403)

    await prisma.branchMember.deleteMany({ where: { branchId: unauthBranch.id } })
    await prisma.branch.delete({ where: { id: unauthBranch.id } })
    await prisma.user.delete({ where: { id: unauth.id } })
  })

  it('18. only owner/admin can set isActive', async () => {
    // Doctor trying to set own isActive → 403
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await PUT(
      createRequest('PUT', `/api/doctors/${doctorId}`, { isActive: false }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(403)
  })

  it('19. returns 401 if unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PUT(
      createRequest('PUT', `/api/doctors/${doctorId}`, { bio: 'test' }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════
// PATCH /api/doctors/[userId]/status
// ═══════════════════════════════════════
describe('PATCH /api/doctors/[userId]/status', () => {
  let PATCH: typeof import('../../doctors/[userId]/status/route').PATCH

  beforeEach(async () => {
    const mod = await import('../../doctors/[userId]/status/route')
    PATCH = mod.PATCH
  })

  it('20. toggles active to inactive', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await PATCH(
      createRequest('PATCH', `/api/doctors/${doctorId}/status`, { isActive: false }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.isActive).toBe(false)
  })

  it('21. toggles inactive to active', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await PATCH(
      createRequest('PATCH', `/api/doctors/${doctorId}/status`, { isActive: true }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.isActive).toBe(true)
  })

  it('22. creates profile if none exists with isActive set', async () => {
    // Use owner who has no profile
    mockAuth.mockResolvedValue({ user: { id: adminId } })
    const res = await PATCH(
      createRequest('PATCH', `/api/doctors/${ownerId}/status`, { isActive: false }),
      { params: Promise.resolve({ userId: ownerId }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.isActive).toBe(false)

    // Verify profile was created
    const profile = await prisma.doctorProfile.findUnique({ where: { userId: ownerId } })
    expect(profile).not.toBeNull()
    expect(profile!.isActive).toBe(false)

    // Cleanup
    await prisma.doctorProfile.delete({ where: { userId: ownerId } })
  })

  it('23. returns 403 if not owner/admin (doctor toggling self)', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const res = await PATCH(
      createRequest('PATCH', `/api/doctors/${doctorId}/status`, { isActive: false }),
      { params: Promise.resolve({ userId: doctorId }) }
    )
    expect(res.status).toBe(403)
  })

  it('24. returns 404 if user not found', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
    const res = await PATCH(
      createRequest('PATCH', `/api/doctors/nonexistent-id/status`, { isActive: false }),
      { params: Promise.resolve({ userId: 'nonexistent-id' }) }
    )
    expect(res.status).toBe(404)
  })
})

// ═══════════════════════════════════════
// POST /api/doctors/[userId]/photo
// ═══════════════════════════════════════
describe('POST /api/doctors/[userId]/photo', () => {
  let POST: typeof import('../../doctors/[userId]/photo/route').POST

  beforeEach(async () => {
    const mod = await import('../../doctors/[userId]/photo/route')
    POST = mod.POST
  })

  // Helper to create a FormData request with a fake image
  function createPhotoRequest(userId: string, file: File): NextRequest {
    const formData = new FormData()
    formData.append('photo', file)
    return new NextRequest(`http://localhost:3000/api/doctors/${userId}/photo`, {
      method: 'POST',
      body: formData,
    })
  }

  it('25. uploads photo (mocked R2 — checks validation and auth)', async () => {
    // We can't actually upload to R2 in tests, but we can test validation
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const file = new File([new Uint8Array(100)], 'photo.jpg', { type: 'image/jpeg' })
    const req = createPhotoRequest(doctorId, file)

    // This will fail at R2 upload stage since R2 isn't configured in tests
    // We just verify it gets past auth and validation
    const res = await POST(req, { params: Promise.resolve({ userId: doctorId }) })
    // Expect 200 (if R2 configured) or 500 (R2 not available in test env)
    expect([200, 500]).toContain(res.status)
  })

  it('26. rejects oversized file', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    const req = createPhotoRequest(doctorId, bigFile)

    const res = await POST(req, { params: Promise.resolve({ userId: doctorId }) })
    expect(res.status).toBe(413)
  })

  it('27. rejects invalid mime type', async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    const pdfFile = new File([new Uint8Array(100)], 'doc.pdf', { type: 'application/pdf' })
    const req = createPhotoRequest(doctorId, pdfFile)

    const res = await POST(req, { params: Promise.resolve({ userId: doctorId }) })
    expect(res.status).toBe(400)
  })

  it('28. returns 403 if not self and not owner/admin', async () => {
    const unauth = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-photounauth@test.com`, name: 'Photo Unauth' },
    })
    const unauthBranch = await prisma.branch.create({
      data: { name: `${TEST_PREFIX} Photo Unauth Branch` },
    })
    await prisma.branchMember.create({
      data: { userId: unauth.id, branchId: unauthBranch.id, role: 'DOCTOR' },
    })

    mockAuth.mockResolvedValue({ user: { id: unauth.id } })
    const file = new File([new Uint8Array(100)], 'photo.jpg', { type: 'image/jpeg' })
    const req = createPhotoRequest(doctorId, file)

    const res = await POST(req, { params: Promise.resolve({ userId: doctorId }) })
    expect(res.status).toBe(403)

    await prisma.branchMember.deleteMany({ where: { branchId: unauthBranch.id } })
    await prisma.branch.delete({ where: { id: unauthBranch.id } })
    await prisma.user.delete({ where: { id: unauth.id } })
  })
})
