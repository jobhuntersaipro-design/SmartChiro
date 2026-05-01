import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// Returns per-branch patient stats for branches the current user has OWNER/ADMIN
// access to. DOCTOR users get a single entry for their active branch with
// counts scoped to their own patients.
//
// Response: { role, scope, branches: [{ branchId, branchName, activePatients,
//   newThisMonth, upcomingThisWeek }] }

function startOfMonth(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfDay(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        activeBranchId: true,
        branchMemberships: {
          select: {
            branchId: true,
            role: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
    })

    const memberships = user?.branchMemberships ?? []
    const activeBranchId = user?.activeBranchId ?? memberships[0]?.branchId ?? null
    const activeMembership = memberships.find((m) => m.branchId === activeBranchId)
    const isOwnerOrAdmin = activeMembership?.role === 'OWNER' || activeMembership?.role === 'ADMIN'

    const now = new Date()
    const monthStart = startOfMonth(now)
    const todayStart = startOfDay(now)
    const weekEnd = new Date(todayStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    // For OWNER/ADMIN: include every branch they're an OWNER/ADMIN in.
    // For DOCTOR: just their active branch with own-patient scope.
    const branchScopes = isOwnerOrAdmin
      ? memberships
          .filter((m) => m.role === 'OWNER' || m.role === 'ADMIN')
          .map((m) => ({ branchId: m.branchId, branchName: m.branch.name, scopedToOwn: false }))
      : activeBranchId && activeMembership
        ? [
            {
              branchId: activeBranchId,
              branchName: activeMembership.branch.name,
              scopedToOwn: true,
            },
          ]
        : []

    const branches = await Promise.all(
      branchScopes.map(async ({ branchId, branchName, scopedToOwn }) => {
        const baseWhere: Record<string, unknown> = { branchId }
        if (scopedToOwn) baseWhere.doctorId = userId

        const [activePatients, newThisMonth, upcomingThisWeek] = await Promise.all([
          prisma.patient.count({ where: { ...baseWhere, status: 'active' } }),
          prisma.patient.count({ where: { ...baseWhere, createdAt: { gte: monthStart } } }),
          prisma.appointment.count({
            where: {
              branchId,
              ...(scopedToOwn ? { doctorId: userId } : {}),
              status: { in: ['SCHEDULED', 'CHECKED_IN'] },
              dateTime: { gte: now, lt: weekEnd },
            },
          }),
        ])

        return {
          branchId,
          branchName,
          activePatients,
          newThisMonth,
          upcomingThisWeek,
        }
      }),
    )

    return NextResponse.json({
      role: activeMembership?.role ?? 'DOCTOR',
      scope: isOwnerOrAdmin ? 'all-branches' : 'own-patients',
      branches,
    })
  } catch (error) {
    console.error('GET /api/patients/branch-stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch branch stats.' }, { status: 500 })
  }
}
