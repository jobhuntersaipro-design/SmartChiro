import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }))

const TEST_PREFIX = `test-xray-notes-${Date.now()}`

let ownerId: string, outsiderId: string, xrayId: string

function req(method: string, url: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) init.body = JSON.stringify(body)
  return new NextRequest(`http://localhost:3000${url}`, init)
}

describe('Xray Notes API', () => {
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `${TEST_PREFIX}-o@t.com`, name: 'O' } })
    const x = await prisma.user.create({ data: { email: `${TEST_PREFIX}-x@t.com`, name: 'X' } })
    ownerId = o.id; outsiderId = x.id

    const b = await prisma.branch.create({ data: { name: `${TEST_PREFIX} B` } })
    const ob = await prisma.branch.create({ data: { name: `${TEST_PREFIX} OB` } })
    await prisma.branchMember.create({ data: { userId: ownerId, branchId: b.id, role: 'OWNER' } })
    await prisma.branchMember.create({ data: { userId: outsiderId, branchId: ob.id, role: 'OWNER' } })

    const patient = await prisma.patient.create({
      data: { firstName: 'P', lastName: TEST_PREFIX, branchId: b.id, doctorId: ownerId },
    })
    const xray = await prisma.xray.create({
      data: { patientId: patient.id, uploadedById: ownerId, fileName: 'x.jpg', fileSize: 1, mimeType: 'image/jpeg', fileUrl: 'http://x' },
    })
    xrayId = xray.id
  })

  afterAll(async () => {
    await prisma.xrayNote.deleteMany({ where: { xrayId } })
    await prisma.xray.deleteMany({ where: { id: xrayId } })
    await prisma.patient.deleteMany({ where: { lastName: TEST_PREFIX } })
    await prisma.branchMember.deleteMany({ where: { userId: { in: [ownerId, outsiderId] } } })
    await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } })
  })

  it('GET returns null current when no notes exist', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: ownerId } })
    const { GET } = await import('../[xrayId]/notes/route')
    const res = await GET(req('GET', `/api/xrays/${xrayId}/notes`), { params: Promise.resolve({ xrayId }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.current).toBeNull()
    expect(json.history).toEqual([])
  })

  it('POST creates a note and GET reflects it', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: ownerId } })
    const { POST } = await import('../[xrayId]/notes/route')
    const res = await POST(req('POST', `/api/xrays/${xrayId}/notes`, { bodyMd: 'hello' }), {
      params: Promise.resolve({ xrayId }),
    })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.current.bodyMd).toBe('hello')
    expect(json.current.author.id).toBe(ownerId)
  })

  it('POST with empty string is allowed (clears note)', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: ownerId } })
    const { POST } = await import('../[xrayId]/notes/route')
    const res = await POST(req('POST', `/api/xrays/${xrayId}/notes`, { bodyMd: '' }), {
      params: Promise.resolve({ xrayId }),
    })
    expect(res.status).toBe(201)
  })

  it('POST rejects bodyMd > 10000 chars', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: ownerId } })
    const { POST } = await import('../[xrayId]/notes/route')
    const res = await POST(req('POST', `/api/xrays/${xrayId}/notes`, { bodyMd: 'x'.repeat(10001) }), {
      params: Promise.resolve({ xrayId }),
    })
    expect(res.status).toBe(400)
  })

  it('outsider GET -> 404', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: outsiderId } })
    const { GET } = await import('../[xrayId]/notes/route')
    const res = await GET(req('GET', `/api/xrays/${xrayId}/notes`), { params: Promise.resolve({ xrayId }) })
    expect(res.status).toBe(404)
  })

  it('history is ordered newest first', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: ownerId } })
    const { GET } = await import('../[xrayId]/notes/route')
    const res = await GET(req('GET', `/api/xrays/${xrayId}/notes`), { params: Promise.resolve({ xrayId }) })
    const json = await res.json()
    expect(json.current).not.toBeNull()
    if (json.history.length > 0) {
      const ts = json.history.map((h: { createdAt: string }) => new Date(h.createdAt).getTime())
      for (let i = 1; i < ts.length; i++) expect(ts[i - 1]).toBeGreaterThanOrEqual(ts[i])
    }
  })
})
