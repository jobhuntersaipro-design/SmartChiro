import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }))

const headR2Object = vi.fn()
const deleteR2Object = vi.fn()
vi.mock('@/lib/r2', () => ({
  headR2Object: (...args: unknown[]) => headR2Object(...args),
  deleteR2Object: (...args: unknown[]) => deleteR2Object(...args),
  buildXrayKey: (...parts: string[]) => parts.join('/'),
}))

const PREFIX = `test-xray-upload-${Date.now()}`
let doctorId: string, branchId: string, patientId: string

function req(url: string, body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}
const ctx = (xrayId: string) => ({ params: Promise.resolve({ xrayId }) })
const uploading = () =>
  prisma.xray.create({
    data: { patientId, uploadedById: doctorId, fileName: 'a.jpg', fileSize: 10, mimeType: 'image/jpeg', fileUrl: 'http://r2/a', status: 'UPLOADING' },
  })

describe('direct upload: confirm + abort', () => {
  beforeAll(async () => {
    const d = await prisma.user.create({ data: { email: `${PREFIX}-d@t.com`, name: 'D' } })
    doctorId = d.id
    const b = await prisma.branch.create({ data: { name: `${PREFIX} B` } })
    branchId = b.id
    await prisma.branchMember.create({ data: { userId: doctorId, branchId, role: 'DOCTOR' } })
    const p = await prisma.patient.create({ data: { firstName: 'P', lastName: PREFIX, branchId, doctorId } })
    patientId = p.id
  })

  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } })
    headR2Object.mockReset()
    deleteR2Object.mockReset()
  })

  afterAll(async () => {
    await prisma.xray.deleteMany({ where: { patientId } })
    await prisma.patient.deleteMany({ where: { lastName: PREFIX } })
    await prisma.branchMember.deleteMany({ where: { branchId } })
    await prisma.branch.deleteMany({ where: { id: branchId } })
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
  })

  it('confirms an upload that reached storage and saves its metadata', async () => {
    const x = await uploading()
    headR2Object.mockResolvedValue({ size: 10 })
    const { POST } = await import('../[xrayId]/confirm/route')
    const res = await POST(req(`/api/xrays/${x.id}/confirm`, { width: 2000, height: 2400, title: 'Lat C-spine', bodyRegion: 'CERVICAL', viewType: 'LATERAL' }), ctx(x.id))
    expect(res.status).toBe(200)
    const stored = await prisma.xray.findUniqueOrThrow({ where: { id: x.id } })
    expect(stored).toMatchObject({ status: 'READY', width: 2000, height: 2400, title: 'Lat C-spine', bodyRegion: 'CERVICAL', viewType: 'LATERAL' })
  })

  it("refuses to mark READY when the file isn't in storage", async () => {
    const x = await uploading()
    headR2Object.mockResolvedValue(null)
    const { POST } = await import('../[xrayId]/confirm/route')
    const res = await POST(req(`/api/xrays/${x.id}/confirm`, { width: 2000, height: 2400 }), ctx(x.id))
    expect(res.status).toBe(409)
    expect((await prisma.xray.findUniqueOrThrow({ where: { id: x.id } })).status).toBe('UPLOADING')
  })

  it('rejects bad dimensions and unknown regions', async () => {
    const x = await uploading()
    const { POST } = await import('../[xrayId]/confirm/route')
    expect((await POST(req(`/api/xrays/${x.id}/confirm`, { width: 50, height: 2400 }), ctx(x.id))).status).toBe(400)
    expect((await POST(req(`/api/xrays/${x.id}/confirm`, { width: 500, height: 500, bodyRegion: 'KNEE' }), ctx(x.id))).status).toBe(400)
  })

  it('abort deletes an UPLOADING row and its files, but never a confirmed X-ray', async () => {
    const { POST } = await import('../[xrayId]/abort/route')
    const x = await uploading()
    deleteR2Object.mockResolvedValue(undefined)
    expect((await POST(req(`/api/xrays/${x.id}/abort`), ctx(x.id))).status).toBe(204)
    expect(await prisma.xray.findUnique({ where: { id: x.id } })).toBeNull()
    expect(deleteR2Object).toHaveBeenCalledTimes(2)

    const ready = await prisma.xray.create({
      data: { patientId, uploadedById: doctorId, fileName: 'b.jpg', fileSize: 1, mimeType: 'image/jpeg', fileUrl: 'http://r2/b', status: 'READY' },
    })
    expect((await POST(req(`/api/xrays/${ready.id}/abort`), ctx(ready.id))).status).toBe(409)
    expect(await prisma.xray.findUnique({ where: { id: ready.id } })).not.toBeNull()
  })

  it('hides the routes from people without access', async () => {
    const x = await uploading()
    mockAuth.mockResolvedValue(null)
    const { POST } = await import('../[xrayId]/abort/route')
    expect((await POST(req(`/api/xrays/${x.id}/abort`), ctx(x.id))).status).toBe(401)
  })
})
