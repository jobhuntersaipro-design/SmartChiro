import { cache } from 'react'
import type { BranchRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export interface BranchContext {
  activeBranchId: string | null
  /** The user's role in the active branch — never another branch's role. */
  branchRole: BranchRole | null
  branches: { id: string; name: string; role: BranchRole }[]
}

/**
 * Resolves the user's active branch and their role *in that branch* from the
 * database. The session only stores who the user is: roles copied into the
 * JWT at sign-in went stale (a new owner couldn't add doctors until they
 * signed in again), were missing for Google sign-ins, and picked an
 * arbitrary membership for users in several branches.
 * Cached per request, so a page and its layout share one query.
 */
export const loadBranchContext = cache(async (userId: string): Promise<BranchContext> => {
  // One round trip (Prisma's nested select would issue three), since this runs
  // for every signed-in request. Parameterised via the tagged template.
  const rows = await prisma.$queryRaw<{ id: string; name: string; role: BranchRole; activeBranchId: string | null }[]>`
    SELECT b."id", b."name", m."role", u."activeBranchId"
    FROM "BranchMember" m
    JOIN "Branch" b ON b."id" = m."branchId"
    JOIN "User" u ON u."id" = m."userId"
    WHERE m."userId" = ${userId}
    ORDER BY m."createdAt" ASC`
  const branches = rows.map(({ id, name, role }) => ({ id, name, role }))
  const activeId = rows[0]?.activeBranchId ?? null
  const active = branches.find((b) => b.id === activeId) ?? branches[0] ?? null
  return { activeBranchId: active?.id ?? null, branchRole: active?.role ?? null, branches }
})
