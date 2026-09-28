import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { loadBranchContext } from '@/lib/branch-context'

/** `branchId: "all"` switches to "All branches" (owners/admins of 2+ branches). */
const Body = z.object({ branchId: z.string().min(1) })

/** Switch the branch the dashboard works in (role follows from the membership). */
export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'validation' }, { status: 422 })

  if (parsed.data.branchId === 'all') {
    const context = await loadBranchContext(session.user.id)
    if (!context.canUseAllBranches) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    await prisma.user.update({
      where: { id: session.user.id },
      data: { allBranches: true },
      select: { id: true },
    })
    return NextResponse.json({ allBranches: true, activeBranchId: context.activeBranchId, branchRole: context.branchRole })
  }

  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId: parsed.data.branchId } },
    select: { role: true },
  })
  // 404, not 403: don't confirm that someone else's branch exists.
  if (!membership) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await prisma.user.update({
    where: { id: session.user.id },
    data: { activeBranchId: parsed.data.branchId, allBranches: false },
    select: { id: true },
  })
  return NextResponse.json({ activeBranchId: parsed.data.branchId, branchRole: membership.role })
}
