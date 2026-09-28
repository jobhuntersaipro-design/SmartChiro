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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      activeBranchId: true,
      branchMemberships: {
        orderBy: { createdAt: 'asc' },
        select: { role: true, branch: { select: { id: true, name: true } } },
      },
    },
  })
  const branches = (user?.branchMemberships ?? []).map((m) => ({ id: m.branch.id, name: m.branch.name, role: m.role }))
  const active = branches.find((b) => b.id === user?.activeBranchId) ?? branches[0] ?? null
  return { activeBranchId: active?.id ?? null, branchRole: active?.role ?? null, branches }
})
