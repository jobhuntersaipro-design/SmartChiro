import { describe, it, expect } from 'vitest'
import {
  canUseAllBranches,
  narrowScope,
  resolveBranchScope,
  scopedWhere,
  scopeKey,
  scopeRole,
  type BranchMembershipSummary,
} from '@/lib/branch-scope'

const KLCC: BranchMembershipSummary = { id: 'b-klcc', name: 'KLCC', role: 'OWNER' }
const BANGSAR: BranchMembershipSummary = { id: 'b-bangsar', name: 'Bangsar', role: 'ADMIN' }
const PENANG: BranchMembershipSummary = { id: 'b-penang', name: 'Penang', role: 'DOCTOR' }

describe('canUseAllBranches', () => {
  it('needs OWNER/ADMIN in two or more branches', () => {
    expect(canUseAllBranches([KLCC, BANGSAR])).toBe(true)
    expect(canUseAllBranches([KLCC, PENANG])).toBe(false)
    expect(canUseAllBranches([KLCC])).toBe(false)
    expect(canUseAllBranches([])).toBe(false)
  })
})

describe('resolveBranchScope', () => {
  it('scopes to the stored active branch', () => {
    const scope = resolveBranchScope([KLCC, BANGSAR, PENANG], 'b-bangsar', false)
    expect(scope).toMatchObject({
      activeBranchId: 'b-bangsar',
      branchRole: 'ADMIN',
      allBranches: false,
      canUseAllBranches: true,
      branchIds: ['b-bangsar'],
    })
    expect(scope.roles).toEqual({ 'b-klcc': 'OWNER', 'b-bangsar': 'ADMIN', 'b-penang': 'DOCTOR' })
  })

  it('falls back to the first membership when the stored branch is gone', () => {
    const scope = resolveBranchScope([KLCC, BANGSAR], 'deleted-branch', false)
    expect(scope.activeBranchId).toBe('b-klcc')
    expect(scope.branchIds).toEqual(['b-klcc'])
  })

  it('"All branches" spans every membership but keeps the remembered branch', () => {
    const scope = resolveBranchScope([KLCC, BANGSAR, PENANG], 'b-penang', true)
    expect(scope.allBranches).toBe(true)
    expect(scope.branchIds).toEqual(['b-klcc', 'b-bangsar', 'b-penang'])
    expect(scope.activeBranchId).toBe('b-penang')
    expect(scope.branchRole).toBe('DOCTOR')
  })

  it('ignores a stored "All branches" flag the user no longer qualifies for', () => {
    const scope = resolveBranchScope([KLCC, PENANG], 'b-klcc', true)
    expect(scope.allBranches).toBe(false)
    expect(scope.branchIds).toEqual(['b-klcc'])
  })

  it('is empty for a user without branches', () => {
    expect(resolveBranchScope([], null, false)).toMatchObject({
      activeBranchId: null,
      branchRole: null,
      branchIds: [],
      allBranches: false,
    })
  })
})

describe('narrowScope', () => {
  const scope = resolveBranchScope([KLCC, BANGSAR, PENANG], 'b-klcc', true)

  it('keeps the scope when no branch is requested', () => {
    expect(narrowScope(scope, null).branchIds).toEqual(scope.branchIds)
  })

  it('narrows to a member branch, and to nothing for a non-member branch', () => {
    expect(narrowScope(scope, 'b-penang').branchIds).toEqual(['b-penang'])
    expect(narrowScope(scope, 'someone-elses-branch').branchIds).toEqual([])
  })
})

describe('scopedWhere', () => {
  it('whole branches where the user manages them', () => {
    const scope = resolveBranchScope([KLCC, BANGSAR], 'b-klcc', true)
    expect(scopedWhere(scope, 'u1')).toEqual({ branchId: { in: ['b-klcc', 'b-bangsar'] } })
  })

  it('own records only where the user is a DOCTOR', () => {
    const scope = resolveBranchScope([PENANG], 'b-penang', false)
    expect(scopedWhere(scope, 'u1')).toEqual({ branchId: { in: ['b-penang'] }, doctorId: 'u1' })
  })

  it('mixes both across "All branches"', () => {
    const scope = resolveBranchScope([KLCC, BANGSAR, PENANG], 'b-klcc', true)
    expect(scopedWhere(scope, 'u1')).toEqual({
      OR: [{ branchId: { in: ['b-klcc', 'b-bangsar'] } }, { branchId: { in: ['b-penang'] }, doctorId: 'u1' }],
    })
  })

  it('matches nothing for an empty scope', () => {
    expect(scopedWhere(resolveBranchScope([], null, false), 'u1')).toEqual({ branchId: { in: [] } })
  })
})

describe('scopeKey / scopeRole', () => {
  it('keys the scope by branch or "all"', () => {
    expect(scopeKey(resolveBranchScope([KLCC, BANGSAR], 'b-bangsar', false))).toBe('b-bangsar')
    expect(scopeKey(resolveBranchScope([KLCC, BANGSAR], 'b-bangsar', true))).toBe('all')
    expect(scopeKey(resolveBranchScope([], null, false))).toBe('none')
  })

  it('uses the strongest managing role in "All branches"', () => {
    expect(scopeRole(resolveBranchScope([KLCC, BANGSAR, PENANG], 'b-penang', true))).toBe('OWNER')
    expect(scopeRole(resolveBranchScope([KLCC, BANGSAR, PENANG], 'b-penang', false))).toBe('DOCTOR')
  })
})
