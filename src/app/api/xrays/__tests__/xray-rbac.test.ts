import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }))

const TEST_PREFIX = `test-xray-rbac-${Date.now()}`

let ownerId: string, adminId: string, doctorId: string, outsiderId: string
let branchId: string, patientId: string, xrayId: string

function req(method: string, url: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) init.body = JSON.stringify(body)
  return new NextRequest(`http://localhost:3000${url}`, init)
}

describe('Xray RBAC matrix', () => {
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `${TEST_PREFIX}-o@t.com`, name: 'O' } })
    const a = await prisma.user.create({ data: { email: `${TEST_PREFIX}-a@t.com`, name: 'A' } })
    const d = await prisma.user.create({ data: { email: `${TEST_PREFIX}-d@t.com`, name: 'D' } })
    const x = await prisma.user.create({ data: { email: `${TEST_PREFIX}-x@t.com`, name: 'X' } })
    ownerId = o.id; adminId = a.id; doctorId = d.id; outsiderId = x.id

    const b = await prisma.branch.create({ data: { name: `${TEST_PREFIX} B` } })
    const ob = await prisma.branch.create({ data: { name: `${TEST_PREFIX} OB` } })
    branchId = b.id

    await prisma.branchMember.create({ data: { userId: ownerId, branchId, role: 'OWNER' } })
    await prisma.branchMember.create({ data: { userId: adminId, branchId, role: 'ADMIN' } })
    await prisma.branchMember.create({ data: { userId: doctorId, branchId, role: 'DOCTOR' } })
    await prisma.branchMember.create({ data: { userId: outsiderId, branchId: ob.id, role: 'OWNER' } })

    const patient = await prisma.patient.create({
      data: { firstName: 'P', lastName: TEST_PREFIX, branchId, doctorId },
    })
    patientId = patient.id

    const xray = await prisma.xray.create({
      data: { patientId, uploadedById: doctorId, fileName: 'x.jpg', fileSize: 1, mimeType: 'image/jpeg', fileUrl: 'http://x' },
    })
    xrayId = xray.id
  })

  afterAll(async () => {
    await prisma.xray.deleteMany({ where: { patientId } })
    await prisma.patient.deleteMany({ where: { lastName: TEST_PREFIX } })
    await prisma.branchMember.deleteMany({ where: { userId: { in: [ownerId, adminId, doctorId, outsiderId] } } })
    await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } })
    mockAuth.mockReset()
  })

  describe('PATCH /api/xrays/[xrayId]', () => {
    it.each([
      ['OWNER',   () => ownerId,   200],
      ['ADMIN',   () => adminId,   200],
      ['DOCTOR',  () => doctorId,  200],
      ['outsider',() => outsiderId,404],
    ])('%s -> %i', async (_, getId, expectedStatus) => {
      mockAuth.mockResolvedValueOnce({ user: { id: getId() } })
      const { PATCH } = await import('../[xrayId]/route')
      const res = await PATCH(req('PATCH', `/api/xrays/${xrayId}`, { title: `t-${expectedStatus}` }), {
        params: Promise.resolve({ xrayId }),
      })
      expect(res.status).toBe(expectedStatus)
    })
  })

  describe('DELETE /api/xrays/[xrayId]', () => {
    it.each([
      ['OWNER',   () => ownerId,   200],
      ['outsider',() => outsiderId,404],
    ])('%s -> %i', async (_, getId, expectedStatus) => {
      mockAuth.mockResolvedValueOnce({ user: { id: getId() } })
      const { DELETE } = await import('../[xrayId]/route')
      const res = await DELETE(req('DELETE', `/api/xrays/${xrayId}`), { params: Promise.resolve({ xrayId }) })
      expect(res.status).toBe(expectedStatus)
    })
  })

  describe('POST /api/xrays/upload-url', () => {
    it('outsider -> 404', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: outsiderId } })
      const { POST } = await import('../upload-url/route')
      const res = await POST(req('POST', '/api/xrays/upload-url', {
        fileName: 'a.jpg', fileSize: 100, mimeType: 'image/jpeg', patientId,
      }))
      expect(res.status).toBe(404)
    })

    it('doctor -> 200', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: doctorId } })
      const { POST } = await import('../upload-url/route')
      const res = await POST(req('POST', '/api/xrays/upload-url', {
        fileName: 'a.jpg', fileSize: 100, mimeType: 'image/jpeg', patientId,
      }))
      expect(res.status).toBe(200)
    })
  })
})
