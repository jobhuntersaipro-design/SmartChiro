import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { clinicCalendar } from '@/lib/clinic-time'
import { loadBranchContext } from '@/lib/branch-context'
import { scopedWhere } from '@/lib/branch-scope'

type Range = 'today' | 'week' | 'month'

function rangeBounds(range: Range, now: Date = new Date()): { gte: Date; lt: Date } {
  const lt = clinicCalendar(now).addDays(range === 'today' ? 1 : range === 'week' ? 7 : 30)
  // gte = now (not start of day) so the list excludes appointments earlier today.
  return { gte: now, lt }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    const { searchParams } = new URL(request.url)
    const rangeParam = (searchParams.get('range') ?? 'week') as string
    const range: Range = rangeParam === 'today' || rangeParam === 'month' ? rangeParam : 'week'

    // Follows the sidebar branch switcher (one branch or "All branches").
    // Owner/Admin sees every appointment in a branch; a DOCTOR only their own.
    const scope = await loadBranchContext(userId)
    if (scope.branchIds.length === 0) {
      return NextResponse.json({ range, total: 0, appointments: [] })
    }
    const access = scopedWhere(scope, userId)

    const { gte, lt } = rangeBounds(range)

    const appointments = await prisma.appointment.findMany({
      where: {
        status: { in: ['SCHEDULED', 'CHECKED_IN'] },
        dateTime: { gte, lt },
        ...access,
      },
      orderBy: { dateTime: 'asc' },
      take: 100,
      select: {
        id: true,
        dateTime: true,
        duration: true,
        status: true,
        notes: true,
        patient: {
          select: { id: true, firstName: true, lastName: true, phone: true, status: true },
        },
        doctor: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({
      range,
      total: appointments.length,
      appointments: appointments.map((a) => ({
        id: a.id,
        dateTime: a.dateTime.toISOString(),
        duration: a.duration,
        status: a.status,
        notes: a.notes,
        patient: a.patient,
        doctor: { id: a.doctor.id, name: a.doctor.name ?? 'Unknown' },
        branch: a.branch,
      })),
    })
  } catch (error) {
    console.error('GET /api/appointments/upcoming error:', error)
    return NextResponse.json({ error: 'Failed to fetch upcoming appointments.' }, { status: 500 })
  }
}
