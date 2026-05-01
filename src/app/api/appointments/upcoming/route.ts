import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

type Range = 'today' | 'week' | 'month'

function rangeBounds(range: Range, now: Date = new Date()): { gte: Date; lt: Date } {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const lt = new Date(start)
  if (range === 'today') {
    lt.setDate(lt.getDate() + 1)
  } else if (range === 'week') {
    lt.setDate(lt.getDate() + 7)
  } else {
    lt.setDate(lt.getDate() + 30)
  }
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

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        activeBranchId: true,
        branchMemberships: { select: { branchId: true, role: true } },
      },
    })

    const activeBranchId = user?.activeBranchId ?? user?.branchMemberships[0]?.branchId
    const membership = user?.branchMemberships.find((m) => m.branchId === activeBranchId)
    const isOwnerOrAdmin = membership?.role === 'OWNER' || membership?.role === 'ADMIN'

    const { gte, lt } = rangeBounds(range)

    const where: Record<string, unknown> = {
      status: { in: ['SCHEDULED', 'CHECKED_IN'] },
      dateTime: { gte, lt },
    }

    if (isOwnerOrAdmin && activeBranchId) {
      where.branchId = activeBranchId
    } else {
      // DOCTOR: only own appointments
      where.doctorId = userId
    }

    const appointments = await prisma.appointment.findMany({
      where,
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
      })),
    })
  } catch (error) {
    console.error('GET /api/appointments/upcoming error:', error)
    return NextResponse.json({ error: 'Failed to fetch upcoming appointments.' }, { status: 500 })
  }
}
