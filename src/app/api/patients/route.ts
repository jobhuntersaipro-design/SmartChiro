import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

const VALID_BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']
const VALID_MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed']
const IC_REGEX = /^\d{6}-?\d{2}-?\d{4}$/

function extractDobFromIc(ic: string): Date | null {
  const digits = ic.replace(/-/g, '')
  if (digits.length !== 12) return null
  const yy = parseInt(digits.substring(0, 2), 10)
  const mm = parseInt(digits.substring(2, 4), 10)
  const dd = parseInt(digits.substring(4, 6), 10)
  // Assume 00-29 = 2000s, 30-99 = 1900s
  const year = yy <= 29 ? 2000 + yy : 1900 + yy
  const date = new Date(Date.UTC(year, mm - 1, dd))
  if (isNaN(date.getTime()) || date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null
  return date
}

function mapPatientToResponse(p: {
  id: string; firstName: string; lastName: string; email: string | null;
  phone: string | null; dateOfBirth: Date | null; gender: string | null;
  address: string | null; emergencyContact: string | null;
  medicalHistory: string | null; notes: string | null;
  icNumber: string | null; occupation: string | null; race: string | null;
  maritalStatus: string | null; bloodType: string | null; allergies: string | null;
  referralSource: string | null;
  initialTreatmentFee: number | null;
  firstTreatmentFee: number | null;
  standardFollowUpFee: number | null;
  addressLine1: string | null; addressLine2: string | null; city: string | null;
  state: string | null; postcode: string | null; country: string | null;
  emergencyName: string | null; emergencyPhone: string | null; emergencyRelation: string | null;
  status: string | null;
  reminderChannel: 'WHATSAPP' | 'EMAIL' | 'BOTH' | 'NONE';
  preferredLanguage: string;
  doctorId: string; branchId: string;
  createdAt: Date;
  doctor: { id: string; name: string | null } | null;
  _count: { visits: number; xrays: number };
  visits: { visitDate: Date }[];
  xrays: { id: string; title: string | null; bodyRegion: string | null; viewType: string | null; status: string; thumbnailUrl: string | null; createdAt: Date; _count: { annotations: number } }[];
  appointments?: { id: string; dateTime: Date; status: string }[];
}) {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    phone: p.phone,
    icNumber: p.icNumber,
    dateOfBirth: p.dateOfBirth?.toISOString() ?? null,
    gender: p.gender,
    occupation: p.occupation,
    race: p.race,
    maritalStatus: p.maritalStatus,
    bloodType: p.bloodType,
    allergies: p.allergies,
    referralSource: p.referralSource,
    initialTreatmentFee: p.initialTreatmentFee,
    firstTreatmentFee: p.firstTreatmentFee,
    standardFollowUpFee: p.standardFollowUpFee,
    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    city: p.city,
    state: p.state,
    postcode: p.postcode,
    country: p.country,
    emergencyName: p.emergencyName,
    emergencyPhone: p.emergencyPhone,
    emergencyRelation: p.emergencyRelation,
    address: p.address,
    emergencyContact: p.emergencyContact,
    medicalHistory: p.medicalHistory,
    notes: p.notes,
    status: p.status ?? 'active',
    reminderChannel: p.reminderChannel,
    preferredLanguage: p.preferredLanguage,
    doctorId: p.doctorId,
    doctorName: p.doctor?.name ?? 'Unknown',
    branchId: p.branchId,
    lastVisit: p.visits[0]?.visitDate?.toISOString() ?? null,
    totalVisits: p._count.visits,
    totalXrays: p._count.xrays,
    upcomingAppointment: p.appointments && p.appointments[0]
      ? {
          id: p.appointments[0].id,
          dateTime: p.appointments[0].dateTime.toISOString(),
          status: p.appointments[0].status,
        }
      : null,
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
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim() || null
    const branchIdFilter = searchParams.get('branchId') || null
    const statusFilter = searchParams.get('status') || null
    const doctorIdFilter = searchParams.get('doctorId') || null

    // Determine user's role in their active branch
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        activeBranchId: true,
        branchMemberships: {
          select: { branchId: true, role: true },
        },
      },
    })

    const activeBranchId = branchIdFilter || user?.activeBranchId || user?.branchMemberships[0]?.branchId
    const membershipInBranch = user?.branchMemberships.find(
      (m) => m.branchId === activeBranchId
    )
    const isOwnerOrAdmin = membershipInBranch?.role === 'OWNER' || membershipInBranch?.role === 'ADMIN'

    // Build where clause
    const where: Record<string, unknown> = {}

    if (isOwnerOrAdmin && activeBranchId) {
      // OWNER/ADMIN: see all patients in the branch
      where.branchId = activeBranchId
      // OWNER/ADMIN can filter by doctorId
      if (doctorIdFilter && doctorIdFilter !== 'all') {
        where.doctorId = doctorIdFilter
      }
    } else {
      // DOCTOR: see only own patients, doctorId filter ignored
      where.doctorId = userId
    }

    // Status filter
    if (statusFilter && statusFilter !== 'all') {
      where.status = statusFilter
    }

    // Search filter — now includes IC number
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { icNumber: { contains: search, mode: 'insensitive' } },
      ]
    }

    const now = new Date()
    const patients = await prisma.patient.findMany({
      where,
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
        appointments: {
          where: { status: { in: ['SCHEDULED', 'CHECKED_IN'] }, dateTime: { gte: now } },
          orderBy: { dateTime: 'asc' },
          take: 1,
          select: { id: true, dateTime: true, status: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    const result = patients.map(mapPatientToResponse)

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
    const {
      firstName, lastName, email, phone, dateOfBirth, gender,
      icNumber, occupation, race, maritalStatus, bloodType, allergies, referralSource,
      addressLine1, addressLine2, city, state, postcode, country,
      emergencyName, emergencyPhone, emergencyRelation,
      medicalHistory, notes, doctorId,
      initialTreatmentFee, firstTreatmentFee, standardFollowUpFee,
      reminderChannel, preferredLanguage,
    } = body

    const VALID_REMINDER_CHANNELS = ['WHATSAPP', 'EMAIL', 'BOTH', 'NONE'] as const
    const VALID_LANGUAGES = ['en', 'ms'] as const
    if (reminderChannel && !VALID_REMINDER_CHANNELS.includes(reminderChannel)) {
      return NextResponse.json(
        { error: `Invalid reminderChannel. Must be one of: ${VALID_REMINDER_CHANNELS.join(', ')}` },
        { status: 400 }
      )
    }
    if (preferredLanguage && !VALID_LANGUAGES.includes(preferredLanguage)) {
      return NextResponse.json(
        { error: `Invalid preferredLanguage. Must be one of: ${VALID_LANGUAGES.join(', ')}` },
        { status: 400 }
      )
    }

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

    // Validate IC number
    if (icNumber && !IC_REGEX.test(icNumber)) {
      return NextResponse.json(
        { error: 'Invalid IC number format. Expected 12 digits (YYMMDD-SS-XXXX).' },
        { status: 400 }
      )
    }

    // Validate blood type
    if (bloodType && !VALID_BLOOD_TYPES.includes(bloodType)) {
      return NextResponse.json(
        { error: `Invalid blood type. Must be one of: ${VALID_BLOOD_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate marital status
    if (maritalStatus && !VALID_MARITAL_STATUSES.includes(maritalStatus)) {
      return NextResponse.json(
        { error: `Invalid marital status. Must be one of: ${VALID_MARITAL_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    // Get user's active branch, fall back to first membership
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        activeBranchId: true,
        branchMemberships: {
          select: { branchId: true, role: true },
          take: 1,
        },
      },
    })

    let branchId = user?.activeBranchId ?? user?.branchMemberships[0]?.branchId ?? null
    const isOwnerOrAdmin = user?.branchMemberships[0]?.role === 'OWNER' || user?.branchMemberships[0]?.role === 'ADMIN'

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
      await prisma.user.update({
        where: { id: session.user.id },
        data: { activeBranchId: branchId },
      })
    }

    // Resolve assigned doctor
    let assignedDoctorId = session.user.id
    if (doctorId && isOwnerOrAdmin) {
      // Verify doctorId is a branch member
      const isMember = await prisma.branchMember.findUnique({
        where: { userId_branchId: { userId: doctorId, branchId } },
      })
      if (!isMember) {
        return NextResponse.json(
          { error: 'Assigned doctor must be a member of the branch.' },
          { status: 400 }
        )
      }
      assignedDoctorId = doctorId
    }

    // Auto-extract DOB from IC if dateOfBirth is empty
    let resolvedDob: Date | null = dateOfBirth ? new Date(dateOfBirth) : null
    if (!resolvedDob && icNumber && IC_REGEX.test(icNumber)) {
      resolvedDob = extractDobFromIc(icNumber)
    }

    const patient = await prisma.patient.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        dateOfBirth: resolvedDob,
        gender: gender || null,
        icNumber: icNumber?.trim() || null,
        occupation: occupation?.trim() || null,
        race: race || null,
        maritalStatus: maritalStatus || null,
        bloodType: bloodType || null,
        allergies: allergies?.trim() || null,
        referralSource: referralSource || null,
        addressLine1: addressLine1?.trim() || null,
        addressLine2: addressLine2?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        postcode: postcode?.trim() || null,
        country: country?.trim() || null,
        emergencyName: emergencyName?.trim() || null,
        emergencyPhone: emergencyPhone?.trim() || null,
        emergencyRelation: emergencyRelation || null,
        medicalHistory: medicalHistory || null,
        notes: notes || null,
        initialTreatmentFee: typeof initialTreatmentFee === 'number' ? initialTreatmentFee : null,
        firstTreatmentFee: typeof firstTreatmentFee === 'number' ? firstTreatmentFee : null,
        standardFollowUpFee: typeof standardFollowUpFee === 'number' ? standardFollowUpFee : null,
        status: 'active',
        reminderChannel: reminderChannel ?? 'WHATSAPP',
        preferredLanguage: preferredLanguage ?? 'en',
        branchId,
        doctorId: assignedDoctorId,
      },
      include: {
        doctor: { select: { id: true, name: true } },
        _count: { select: { visits: true, xrays: true } },
        xrays: {
          where: { status: 'READY' },
          select: {
            id: true, title: true, bodyRegion: true, viewType: true, status: true,
            thumbnailUrl: true, createdAt: true, _count: { select: { annotations: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        visits: {
          select: { visitDate: true },
          orderBy: { visitDate: 'desc' },
          take: 1,
        },
        appointments: {
          where: { status: { in: ['SCHEDULED', 'CHECKED_IN'] }, dateTime: { gte: new Date() } },
          orderBy: { dateTime: 'asc' },
          take: 1,
          select: { id: true, dateTime: true, status: true },
        },
      },
    })

    return NextResponse.json(mapPatientToResponse(patient), { status: 201 })
  } catch (error) {
    console.error('POST /api/patients error:', error)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const target = (error as { meta?: { target?: string[] } }).meta?.target?.join(', ') ?? 'field'
      const field = target.includes('email') ? 'email address' : target.includes('icNumber') ? 'IC number' : target
      return NextResponse.json(
        { error: `A patient with this ${field} already exists.` },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to create patient.' }, { status: 500 })
  }
}
