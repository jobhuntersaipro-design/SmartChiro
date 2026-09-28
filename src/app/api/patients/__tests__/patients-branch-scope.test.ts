import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }))

const PREFIX = `test-patients-scope-${Date.now()}`
let ownerId: string, otherDoctorId: string
let branchA: string, branchB: string, branchC: string, foreignBranch: string

const get = (query = '') => new NextRequest(`http://localhost:3000/api/patients${query}`)

async function listNames(query = ''): Promise<string[]> {
  const { GET } = await import('../route')
  const res = await GET(get(query))
  expect(res.status).toBe(200)
  const body = (await res.json()) as { firstName: string }[]
  return body.map((p) => p.firstName).sort()
}

describe('GET /api/patients follows the sidebar branch scope', () => {
  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `${PREFIX}-owner@t.com`, name: 'Owner' } })
    const other = await prisma.user.create({ data: { email: `${PREFIX}-doc@t.com`, name: 'Dr Other' } })
    ownerId = owner.id
    otherDoctorId = other.id
    const [a, b, c, f] = await Promise.all(
      ['A', 'B', 'C', 'F'].map((n) => prisma.branch.create({ data: { name: `${PREFIX} ${n}` } })),
    )
    branchA = a.id
    branchB = b.id
    branchC = c.id
    foreignBranch = f.id
    // OWNER of A, ADMIN of B, DOCTOR in C.
    await prisma.branchMember.createMany({
      data: [
        { userId: ownerId, branchId: branchA, role: 'OWNER' },
        { userId: ownerId, branchId: branchB, role: 'ADMIN' },
        { userId: ownerId, branchId: branchC, role: 'DOCTOR' },
        { userId: otherDoctorId, branchId: branchC, role: 'DOCTOR' },
        { userId: otherDoctorId, branchId: foreignBranch, role: 'OWNER' },
      ],
    })
    await prisma.patient.createMany({
      data: [
        { firstName: 'Aisha', lastName: 'A', branchId: branchA, doctorId: otherDoctorId },
        { firstName: 'Bala', lastName: 'B', branchId: branchB, doctorId: otherDoctorId },
        { firstName: 'Chong', lastName: 'C', branchId: branchC, doctorId: ownerId },
        { firstName: 'Dina', lastName: 'C', branchId: branchC, doctorId: otherDoctorId },
        { firstName: 'Farid', lastName: 'F', branchId: foreignBranch, doctorId: otherDoctorId },
      ],
    })
    mockAuth.mockResolvedValue({ user: { id: ownerId } })
  })

  afterAll(async () => {
    const ids = [branchA, branchB, branchC, foreignBranch]
    await prisma.patient.deleteMany({ where: { branchId: { in: ids } } })
    await prisma.branchMember.deleteMany({ where: { branchId: { in: ids } } })
    await prisma.branch.deleteMany({ where: { id: { in: ids } } })
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherDoctorId] } } })
  })

  it('a single branch shows only that branch', async () => {
    await prisma.user.update({ where: { id: ownerId }, data: { activeBranchId: branchA, allBranches: false } })
    expect(await listNames()).toEqual(['Aisha'])
    await prisma.user.update({ where: { id: ownerId }, data: { activeBranchId: branchB } })
    expect(await listNames()).toEqual(['Bala'])
  })

  it('keeps DOCTOR own-patient scoping in a branch where the user is a doctor', async () => {
    await prisma.user.update({ where: { id: ownerId }, data: { activeBranchId: branchC, allBranches: false } })
    expect(await listNames()).toEqual(['Chong'])
  })

  it('"All branches" spans every branch, own patients only where a doctor, never foreign ones', async () => {
    await prisma.user.update({ where: { id: ownerId }, data: { activeBranchId: branchA, allBranches: true } })
    expect(await listNames()).toEqual(['Aisha', 'Bala', 'Chong'])
    // Search still applies inside the scope.
    expect(await listNames('?search=bal')).toEqual(['Bala'])
  })

  it('?branchId= narrows to a member branch; a foreign branch returns nothing', async () => {
    await prisma.user.update({ where: { id: ownerId }, data: { activeBranchId: branchA, allBranches: true } })
    expect(await listNames(`?branchId=${branchB}`)).toEqual(['Bala'])
    expect(await listNames(`?branchId=${branchC}`)).toEqual(['Chong'])
    expect(await listNames(`?branchId=${foreignBranch}`)).toEqual([])
  })

  it('includes the branch name for each patient', async () => {
    await prisma.user.update({ where: { id: ownerId }, data: { activeBranchId: branchA, allBranches: true } })
    const { GET } = await import('../route')
    const body = (await (await GET(get())).json()) as { firstName: string; branchName: string }[]
    expect(body.find((p) => p.firstName === 'Bala')?.branchName).toBe(`${PREFIX} B`)
  })
})
