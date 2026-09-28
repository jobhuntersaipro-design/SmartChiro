import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { clinicCalendar } from '@/lib/clinic-time'
import { ACTIVE_PATIENT_STATUS } from '@/lib/stats-scope'
import { loadBranchContext } from '@/lib/branch-context'

// Returns per-branch patient stats for the branches in the user's current
// scope (the sidebar branch, or every branch in "All branches"). In branches
// where the user is a DOCTOR, counts cover their own patients only.
//
// Response: { role, scope, branches: [{ branchId, branchName, totalPatients,
//   activePatients, newThisMonth, upcomingThisWeek }] }

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    // Branches follow the sidebar branch switcher (one branch or "All
    // branches"); in branches where the user is a DOCTOR, own patients only.
    const context = await loadBranchContext(userId)

    const now = new Date()
    const cal = clinicCalendar(now)
    const monthStart = cal.monthStart
    const weekEnd = cal.addDays(7)

    const branchScopes = context.branchIds.map((branchId) => ({
      branchId,
      branchName: context.branches.find((b) => b.id === branchId)?.name ?? '',
      scopedToOwn: context.roles[branchId] === 'DOCTOR',
    }))

    const branches = await Promise.all(
      branchScopes.map(async ({ branchId, branchName, scopedToOwn }) => {
        const baseWhere: Record<string, unknown> = { branchId }
        if (scopedToOwn) baseWhere.doctorId = userId

        const [totalPatients, activePatients, newThisMonth, upcomingThisWeek] = await Promise.all([
          prisma.patient.count({ where: baseWhere }),
          prisma.patient.count({ where: { ...baseWhere, status: ACTIVE_PATIENT_STATUS } }),
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
          totalPatients,
          activePatients,
          newThisMonth,
          upcomingThisWeek,
        }
      }),
    )

    return NextResponse.json({
      role: context.branchRole ?? 'DOCTOR',
      scope: branchScopes.every((b) => b.scopedToOwn) ? 'own-patients' : 'all-branches',
      branches,
    })
  } catch (error) {
    console.error('GET /api/patients/branch-stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch branch stats.' }, { status: 500 })
  }
}
