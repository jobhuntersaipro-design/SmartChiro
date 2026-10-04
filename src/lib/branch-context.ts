import { cache } from 'react'
import type { BranchRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveBranchScope, type BranchScope } from '@/lib/branch-scope'

export type BranchContext = BranchScope

/**
 * Resolves the user's active branch, the "All branches" scope and their role
 * *in each branch* from the database. The session only stores who the user
 * is: roles copied into the JWT at sign-in went stale (a new owner couldn't
 * add doctors until they signed in again), were missing for Google sign-ins,
 * and picked an arbitrary membership for users in several branches.
 * Cached per request, so a page and its layout share one query.
 */
export const loadBranchContext = cache(async (userId: string): Promise<BranchContext> => {
  // One round trip (Prisma's nested select would issue three), since this runs
  // for every signed-in request. Parameterised via the tagged template.
  const rows = await prisma.$queryRaw<
    { id: string; name: string; role: BranchRole; activeBranchId: string | null; allBranches: boolean }[]
  >`
    SELECT b."id", b."name", m."role", u."activeBranchId", u."allBranches"
    FROM "BranchMember" m
    JOIN "Branch" b ON b."id" = m."branchId"
    JOIN "User" u ON u."id" = m."userId"
    WHERE m."userId" = ${userId}
    ORDER BY m."createdAt" ASC`
  const branches = rows.map(({ id, name, role }) => ({ id, name, role }))
  return resolveBranchScope(branches, rows[0]?.activeBranchId ?? null, rows[0]?.allBranches ?? false)
})

/**
 * Branch ids for a list endpoint's `?branchId=`: "all" means every branch
 * the user belongs to (the "All branches" list view); anything else must be
 * a single branch the caller has already checked membership of.
 */
export async function branchIdsForParam(userId: string, branchId: string): Promise<string[]> {
  if (branchId !== 'all') return [branchId]
  return (await loadBranchContext(userId)).branches.map((b) => b.id)
}

/**
 * Forget a remembered active branch the user no longer belongs to (member
 * removed, branch deleted), so nothing falls back to it. `userIds` omitted
 * clears it for everyone.
 */
export async function clearActiveBranch(branchIds: string[], userIds?: string[]) {
  await prisma.user.updateMany({
    where: { activeBranchId: { in: branchIds }, ...(userIds ? { id: { in: userIds } } : {}) },
    data: { activeBranchId: null },
  })
}

/**
 * The scope for a dashboard widget's `?branchId=`: one member branch, or
 * every membership for "all" / none. Null when the user isn't a member of
 * the requested branch. Roles stay per branch (use `scopedWhere`).
 */
export async function dashboardScope(userId: string, branchId: string | null): Promise<BranchContext | null> {
  const ctx = await loadBranchContext(userId)
  if (branchId && branchId !== 'all') {
    return ctx.roles[branchId] ? { ...ctx, branchIds: [branchId] } : null
  }
  return { ...ctx, branchIds: ctx.branches.map((b) => b.id) }
}
