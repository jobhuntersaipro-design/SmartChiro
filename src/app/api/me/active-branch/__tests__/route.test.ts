import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { loadBranchContext } from '@/lib/branch-context'

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }))

const PREFIX = `test-active-branch-${Date.now()}`
let userId: string, ownBranch: string, doctorBranch: string, otherBranch: string

const put = (body: unknown) =>
  new Request('http://x/api/me/active-branch', { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

describe('per-branch role and branch switching', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `${PREFIX}@t.com`, name: 'U' } })
    userId = u.id
    const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((n) => prisma.branch.create({ data: { name: `${PREFIX} ${n}` } })))
    ownBranch = a.id
    doctorBranch = b.id
    otherBranch = c.id
    await prisma.branchMember.create({ data: { userId, branchId: ownBranch, role: 'OWNER' } })
    await prisma.branchMember.create({ data: { userId, branchId: doctorBranch, role: 'DOCTOR' } })
  })

  afterAll(async () => {
    await prisma.branchMember.deleteMany({ where: { userId } })
    await prisma.branch.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.user.deleteMany({ where: { id: userId } })
  })

  it('reports the role in the active branch, falling back to the first membership', async () => {
    expect(await loadBranchContext(userId)).toMatchObject({ activeBranchId: ownBranch, branchRole: 'OWNER' })
    await prisma.user.update({ where: { id: userId }, data: { activeBranchId: doctorBranch } })
    const ctx = await loadBranchContext(userId)
    expect(ctx).toMatchObject({ activeBranchId: doctorBranch, branchRole: 'DOCTOR' })
    expect(ctx.branches.map((b) => b.role)).toEqual(['OWNER', 'DOCTOR'])
  })

  it('switches only to branches the user belongs to', async () => {
    mockAuth.mockResolvedValue({ user: { id: userId } })
    const { PUT } = await import('../route')
    const ok = await PUT(put({ branchId: ownBranch }))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ activeBranchId: ownBranch, branchRole: 'OWNER' })
    expect((await PUT(put({ branchId: otherBranch }))).status).toBe(404)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).activeBranchId).toBe(ownBranch)
    mockAuth.mockResolvedValue(null)
    expect((await PUT(put({ branchId: ownBranch }))).status).toBe(401)
  })

  it('refuses "All branches" to a user who manages fewer than two branches', async () => {
    // OWNER in one branch, DOCTOR in another: not eligible.
    mockAuth.mockResolvedValue({ user: { id: userId } })
    const { PUT } = await import('../route')
    const res = await PUT(put({ branchId: 'all' }))
    expect(res.status).toBe(403)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).allBranches).toBe(false)
    expect((await loadBranchContext(userId)).canUseAllBranches).toBe(false)
  })

  it('switches an owner/admin of 2+ branches to "All branches" and back to one branch', async () => {
    await prisma.branchMember.create({ data: { userId, branchId: otherBranch, role: 'ADMIN' } })
    try {
      mockAuth.mockResolvedValue({ user: { id: userId } })
      const { PUT } = await import('../route')

      const all = await PUT(put({ branchId: 'all' }))
      expect(all.status).toBe(200)
      expect(await all.json()).toMatchObject({ allBranches: true })
      const ctx = await loadBranchContext(userId)
      expect(ctx.allBranches).toBe(true)
      expect(ctx.branchIds.sort()).toEqual([ownBranch, doctorBranch, otherBranch].sort())
      expect(ctx.roles[doctorBranch]).toBe('DOCTOR')

      // Picking a concrete branch clears "All branches".
      const one = await PUT(put({ branchId: otherBranch }))
      expect(one.status).toBe(200)
      expect(await one.json()).toEqual({ activeBranchId: otherBranch, branchRole: 'ADMIN' })
      const after = await loadBranchContext(userId)
      expect(after).toMatchObject({ allBranches: false, activeBranchId: otherBranch, branchIds: [otherBranch] })
    } finally {
      await prisma.branchMember.deleteMany({ where: { userId, branchId: otherBranch } })
    }
  })

  it('drops a stored "All branches" flag once the user no longer qualifies', async () => {
    await prisma.user.update({ where: { id: userId }, data: { allBranches: true, activeBranchId: ownBranch } })
    const ctx = await loadBranchContext(userId)
    expect(ctx.allBranches).toBe(false)
    expect(ctx.branchIds).toEqual([ownBranch])
  })
})
