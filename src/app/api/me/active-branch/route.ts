import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const Body = z.object({ branchId: z.string().min(1) })

/** Switch the branch the dashboard works in (role follows from the membership). */
export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'validation' }, { status: 422 })

  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId: parsed.data.branchId } },
    select: { role: true },
  })
  // 404, not 403: don't confirm that someone else's branch exists.
  if (!membership) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await prisma.user.update({
    where: { id: session.user.id },
    data: { activeBranchId: parsed.data.branchId },
  })
  return NextResponse.json({ activeBranchId: parsed.data.branchId, branchRole: membership.role })
}
