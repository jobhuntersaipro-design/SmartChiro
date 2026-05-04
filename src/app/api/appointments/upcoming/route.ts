import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
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
        branchMemberships: { select: { branchId: true, role: true } },
      },
    })

    // Owner/Admin sees all appointments at their owned/admin branches.
    // Doctor sees only their own appointments at branches where they are a doctor.
    const ownerAdminBranchIds = (user?.branchMemberships ?? [])
      .filter((m) => m.role === 'OWNER' || m.role === 'ADMIN')
      .map((m) => m.branchId)
    const doctorBranchIds = (user?.branchMemberships ?? [])
      .filter((m) => m.role === 'DOCTOR')
      .map((m) => m.branchId)

    const accessClauses: Prisma.AppointmentWhereInput[] = []
    if (ownerAdminBranchIds.length > 0) {
      accessClauses.push({ branchId: { in: ownerAdminBranchIds } })
    }
    if (doctorBranchIds.length > 0) {
      accessClauses.push({ branchId: { in: doctorBranchIds }, doctorId: userId })
    }

    if (accessClauses.length === 0) {
      return NextResponse.json({ range, total: 0, appointments: [] })
    }

    const { gte, lt } = rangeBounds(range)

    const appointments = await prisma.appointment.findMany({
      where: {
        status: { in: ['SCHEDULED', 'CHECKED_IN'] },
        dateTime: { gte, lt },
        OR: accessClauses,
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
