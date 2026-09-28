import type { BranchRole } from '@prisma/client'

export interface BranchMembershipSummary {
  id: string
  name: string
  role: BranchRole
}

/**
 * Which branches a signed-in user is working in right now, as chosen in the
 * sidebar branch switcher. Every list page (patients, appointments,
 * invoices, dashboard) reads this instead of picking its own default.
 */
export interface BranchScope {
  /** The remembered single branch (still set while "All branches" is on). */
  activeBranchId: string | null
  /** The user's role in the active branch — never another branch's role. */
  branchRole: BranchRole | null
  branches: BranchMembershipSummary[]
  /** "All branches" is on (only ever true for users allowed to use it). */
  allBranches: boolean
  /** OWNER/ADMIN in two or more branches — may switch to "All branches". */
  canUseAllBranches: boolean
  /** Branches in scope: every membership in "All branches", else the active one. */
  branchIds: string[]
  /** Role per member branch; what the user may see in each branch follows it. */
  roles: Record<string, BranchRole>
}

/** Roles that manage a whole branch (and so may work across branches). */
export function isBranchManager(role: BranchRole | null | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}

export function canUseAllBranches(branches: BranchMembershipSummary[]): boolean {
  return branches.filter((b) => isBranchManager(b.role)).length >= 2
}

/** Pure scope resolution from the user's memberships and stored preference. */
export function resolveBranchScope(
  branches: BranchMembershipSummary[],
  storedActiveBranchId: string | null,
  storedAllBranches: boolean,
): BranchScope {
  const active = branches.find((b) => b.id === storedActiveBranchId) ?? branches[0] ?? null
  const eligible = canUseAllBranches(branches)
  const allBranches = storedAllBranches && eligible
  return {
    activeBranchId: active?.id ?? null,
    branchRole: active?.role ?? null,
    branches,
    allBranches,
    canUseAllBranches: eligible,
    branchIds: allBranches ? branches.map((b) => b.id) : active ? [active.id] : [],
    roles: Object.fromEntries(branches.map((b) => [b.id, b.role])),
  }
}

/**
 * The scope narrowed to one explicitly requested branch (a `?branchId=`
 * filter). A branch the user isn't a member of yields an empty scope.
 */
export function narrowScope(scope: BranchScope, branchId: string | null | undefined): BranchScope {
  if (!branchId) return scope
  return { ...scope, branchIds: scope.roles[branchId] ? [branchId] : [] }
}

export type ScopedWhere =
  | { branchId: { in: string[] } }
  | { branchId: { in: string[] }; doctorId: string }
  | { OR: ({ branchId: { in: string[] } } | { branchId: { in: string[] }; doctorId: string })[] }

/**
 * A Prisma `where` fragment for records that carry `branchId` + `doctorId`
 * (patients, appointments): the whole branch where the user is not a doctor,
 * and only their own records in branches where they are a DOCTOR.
 */
export function scopedWhere(scope: BranchScope, userId: string): ScopedWhere {
  const whole = scope.branchIds.filter((id) => scope.roles[id] !== 'DOCTOR')
  const own = scope.branchIds.filter((id) => scope.roles[id] === 'DOCTOR')
  if (own.length === 0) return { branchId: { in: whole } }
  if (whole.length === 0) return { branchId: { in: own }, doctorId: userId }
  return { OR: [{ branchId: { in: whole } }, { branchId: { in: own }, doctorId: userId }] }
}

/** Identifies the scope, for client lists that refetch when it changes. */
export function scopeKey(scope: BranchScope): string {
  return scope.allBranches ? 'all' : scope.activeBranchId ?? 'none'
}

/**
 * The role that page-level UI (admin-only buttons, filters) follows: in "All
 * branches" the strongest managing role across branches, else the active
 * branch's role. APIs still check the role in the record's own branch.
 */
export function scopeRole(scope: BranchScope): BranchRole | null {
  if (!scope.allBranches) return scope.branchRole
  const roles = scope.branchIds.map((id) => scope.roles[id])
  if (roles.includes('OWNER')) return 'OWNER'
  if (roles.includes('ADMIN')) return 'ADMIN'
  return scope.branchRole
}
