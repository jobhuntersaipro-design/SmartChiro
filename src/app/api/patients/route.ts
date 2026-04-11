import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const patients = await prisma.patient.findMany({
      where: {
        doctorId: session.user.id,
      },
      include: {
        doctor: { select: { id: true, name: true } },
        _count: { select: { visits: true, xrays: true } },
        xrays: {
          where: { status: 'READY' },
          select: {
            id: true,
            title: true,
            bodyRegion: true,
            viewType: true,
            status: true,
            thumbnailUrl: true,
            createdAt: true,
            _count: { select: { annotations: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        visits: {
          select: { visitDate: true },
          orderBy: { visitDate: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    const result = patients.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phone,
      dateOfBirth: p.dateOfBirth?.toISOString() ?? null,
      gender: p.gender,
      address: p.address,
      emergencyContact: p.emergencyContact,
      medicalHistory: p.medicalHistory,
      notes: p.notes,
      doctorId: p.doctorId,
      doctorName: p.doctor?.name ?? 'Unknown',
      branchId: p.branchId,
      lastVisit: p.visits[0]?.visitDate?.toISOString() ?? null,
      totalVisits: p._count.visits,
      totalXrays: p._count.xrays,
      createdAt: p.createdAt.toISOString(),
      xrays: p.xrays.map((x) => ({
        id: x.id,
        title: x.title,
        bodyRegion: x.bodyRegion,
        viewType: x.viewType,
        status: x.status,
        thumbnailUrl: x.thumbnailUrl,
        annotationCount: x._count.annotations,
        createdAt: x.createdAt.toISOString(),
      })),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/patients error:', error)
    return NextResponse.json({ error: 'Failed to fetch patients.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { firstName, lastName, email, phone, dateOfBirth, gender } = body

    if (!firstName?.trim() || !lastName?.trim()) {
      return NextResponse.json(
        { error: 'First name and last name are required.' },
        { status: 400 }
      )
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address.' },
        { status: 400 }
      )
    }

    // Get user's active branch, fall back to first membership
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        activeBranchId: true,
        branchMemberships: {
          select: { branchId: true },
          take: 1,
        },
      },
    })

    let branchId = user?.activeBranchId ?? user?.branchMemberships[0]?.branchId ?? null

    // If user has no branch at all, create a default one
    if (!branchId) {
      const branch = await prisma.branch.create({
        data: { name: 'My Branch' },
      })
      await prisma.branchMember.create({
        data: { userId: session.user.id, branchId: branch.id, role: 'OWNER' },
      })
      await prisma.user.update({
        where: { id: session.user.id },
        data: { activeBranchId: branch.id },
      })
      branchId = branch.id
    } else if (!user?.activeBranchId) {
      // Set activeBranchId if it was null
      await prisma.user.update({
        where: { id: session.user.id },
        data: { activeBranchId: branchId },
      })
    }

    const patient = await prisma.patient.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender: gender || null,
        branchId,
        doctorId: session.user.id,
      },
      include: {
        doctor: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
      phone: patient.phone,
      dateOfBirth: patient.dateOfBirth?.toISOString() ?? null,
      gender: patient.gender,
      address: patient.address,
      emergencyContact: patient.emergencyContact,
      medicalHistory: patient.medicalHistory,
      notes: patient.notes,
      doctorId: patient.doctorId,
      doctorName: patient.doctor?.name ?? 'Unknown',
      branchId: patient.branchId,
      lastVisit: null,
      totalVisits: 0,
      totalXrays: 0,
      createdAt: patient.createdAt.toISOString(),
      xrays: [],
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/patients error:', error)
    return NextResponse.json({ error: 'Failed to create patient.' }, { status: 500 })
  }
}
