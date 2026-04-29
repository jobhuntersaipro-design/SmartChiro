import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { canManageXray, getXrayCapability } from '@/lib/auth/xray'

const TEST_PREFIX = `test-xray-auth-${Date.now()}`

let ownerId: string
let adminId: string
let doctorId: string
let outsiderId: string
let xrayId: string

describe('canManageXray / getXrayCapability', () => {
  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `${TEST_PREFIX}-o@t.com`, name: 'O' } })
    const admin = await prisma.user.create({ data: { email: `${TEST_PREFIX}-a@t.com`, name: 'A' } })
    const doctor = await prisma.user.create({ data: { email: `${TEST_PREFIX}-d@t.com`, name: 'D' } })
    const outsider = await prisma.user.create({ data: { email: `${TEST_PREFIX}-x@t.com`, name: 'X' } })
    ownerId = owner.id; adminId = admin.id; doctorId = doctor.id; outsiderId = outsider.id

    const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX} Branch` } })
    const otherBranch = await prisma.branch.create({ data: { name: `${TEST_PREFIX} Other` } })

    await prisma.branchMember.create({ data: { userId: ownerId, branchId: branch.id, role: 'OWNER' } })
    await prisma.branchMember.create({ data: { userId: adminId, branchId: branch.id, role: 'ADMIN' } })
    await prisma.branchMember.create({ data: { userId: doctorId, branchId: branch.id, role: 'DOCTOR' } })
    await prisma.branchMember.create({ data: { userId: outsiderId, branchId: otherBranch.id, role: 'OWNER' } })

    const patient = await prisma.patient.create({
      data: { firstName: 'P', lastName: 'X', branchId: branch.id, doctorId },
    })
    const xray = await prisma.xray.create({
      data: {
        patientId: patient.id,
        uploadedById: doctorId,
        fileName: 'x.jpg', fileSize: 1, mimeType: 'image/jpeg', fileUrl: 'http://x',
      },
    })
    xrayId = xray.id
  })

  afterAll(async () => {
    await prisma.xrayNote.deleteMany({ where: { xray: { fileName: 'x.jpg' } } })
    await prisma.xray.deleteMany({ where: { fileName: 'x.jpg' } })
    await prisma.patient.deleteMany({ where: { lastName: 'X', firstName: 'P' } })
    await prisma.branchMember.deleteMany({ where: { userId: { in: [ownerId, adminId, doctorId, outsiderId] } } })
    await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } })
  })

  it('returns "manage" for OWNER', async () => {
    expect(await getXrayCapability(ownerId, xrayId)).toBe('manage')
    expect(await canManageXray(ownerId, xrayId)).toBe(true)
  })

  it('returns "manage" for ADMIN', async () => {
    expect(await getXrayCapability(adminId, xrayId)).toBe('manage')
  })

  it('returns "manage" for DOCTOR', async () => {
    expect(await getXrayCapability(doctorId, xrayId)).toBe('manage')
  })

  it('returns null for users outside the branch', async () => {
    expect(await getXrayCapability(outsiderId, xrayId)).toBeNull()
    expect(await canManageXray(outsiderId, xrayId)).toBe(false)
  })

  it('returns null when the xray does not exist', async () => {
    expect(await getXrayCapability(ownerId, 'nonexistent-id')).toBeNull()
  })
})
