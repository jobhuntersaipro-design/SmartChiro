import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { Prisma } from '@prisma/client'
import { loadBranchContext } from '@/lib/branch-context'
import { narrowScope, scopedWhere } from '@/lib/branch-scope'
import { defaultReminderChannel, reminderChannelError } from '@/lib/reminder-channel'
import { can, redactClinicalFields } from '@/lib/permissions'
import { isValidMyKad, parseNationality } from '@/lib/invoices'

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
  nationality: string | null;
  emergencyName: string | null; emergencyPhone: string | null; emergencyRelation: string | null;
  status: string | null;
  reminderChannel: 'WHATSAPP' | 'EMAIL' | 'BOTH' | 'NONE';
  preferredLanguage: string;
  doctorId: string; branchId: string;
  createdAt: Date;
  doctor: { id: string; name: string | null } | null;
  branch?: { name: string } | null;
  _count: { visits: number; xrays: number };
  visits: { visitDate: Date }[];
  xrays?: { id: string; title: string | null; bodyRegion: string | null; viewType: string | null; status: string; thumbnailUrl: string | null; createdAt: Date; annotations: { shapeCount: number }[] }[];
  appointments?: { id: string; dateTime: Date; status: string; doctorId: string; duration: number; notes: string | null }[];
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
    nationality: p.nationality,
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
    branchName: p.branch?.name ?? null,
    lastVisit: p.visits[0]?.visitDate?.toISOString() ?? null,
    totalVisits: p._count.visits,
    totalXrays: p._count.xrays,
    upcomingAppointment: p.appointments && p.appointments[0]
      ? {
          id: p.appointments[0].id,
          dateTime: p.appointments[0].dateTime.toISOString(),
          status: p.appointments[0].status,
          doctorId: p.appointments[0].doctorId,
          duration: p.appointments[0].duration,
          notes: p.appointments[0].notes ?? null,
        }
      : null,
    createdAt: p.createdAt.toISOString(),
    xrays: (p.xrays ?? []).map((x) => ({
      id: x.id,
      title: x.title,
      bodyRegion: x.bodyRegion,
      viewType: x.viewType,
      status: x.status,
      thumbnailUrl: x.thumbnailUrl,
      annotationCount: x.annotations[0]?.shapeCount ?? 0,
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
    // ?picker=1 — the booking dialog's patient search: 20 rows, names only.
    const pickerMode = searchParams.get('picker') === '1'

    // Scope follows the sidebar branch switcher (one branch or "All
    // branches"); an explicit ?branchId= narrows it to that member branch.
    // In each branch, DOCTORs see only their own patients.
    const scope = narrowScope(await loadBranchContext(userId), branchIdFilter)
    const and: Prisma.PatientWhereInput[] = [scopedWhere(scope, userId)]

    // Doctor filter: only meaningful where the caller sees whole branches.
    const managesAll = scope.branchIds.length > 0 && scope.branchIds.every((id) => scope.roles[id] !== 'DOCTOR')
    if (managesAll && doctorIdFilter && doctorIdFilter !== 'all') {
      and.push({ doctorId: doctorIdFilter })
    }

    // Status filter
    if (statusFilter && statusFilter !== 'all') {
      and.push({ status: statusFilter })
    }

    // Search filter — now includes IC number
    if (search) {
      and.push({
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { icNumber: { contains: search, mode: 'insensitive' } },
        ],
      })
    }
    const where: Prisma.PatientWhereInput = { AND: and }

    if (pickerMode) {
      const options = await prisma.patient.findMany({
        where,
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: 20,
      })
      return NextResponse.json(options)
    }

    const now = new Date()
    // The list shows counts, last visit and the next appointment. It used to
    // also embed every patient's X-rays with annotation counts, which no
    // list view reads (the detail endpoint serves them).
    const patients = await prisma.patient.findMany({
      where,
      include: {
        doctor: { select: { id: true, name: true } },
        branch: { select: { name: true } },
        _count: { select: { visits: true, xrays: true } },
        visits: {
          select: { visitDate: true },
          orderBy: { visitDate: 'desc' },
          take: 1,
        },
        appointments: {
          where: { status: { in: ['SCHEDULED', 'CHECKED_IN'] }, dateTime: { gte: now } },
          orderBy: { dateTime: 'asc' },
          take: 1,
          select: { id: true, dateTime: true, status: true, doctorId: true, duration: true, notes: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    // Front desk gets demographics only — judged per patient's branch, since
    // "All branches" can mix roles.
    const result = patients.map((p) => {
      const row = mapPatientToResponse(p)
      const role = scope.roles[p.branchId]
      return role && !can(role, 'clinical.read') ? redactClinicalFields(role, row) : row
    })

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
      reminderChannel, preferredLanguage, nationality,
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
    // Without an explicit choice the channel follows the contact details given;
    // an explicit one must have the matching contact.
    const resolvedReminderChannel = reminderChannel || defaultReminderChannel({ phone, email })
    const channelError = reminderChannelError(resolvedReminderChannel, { phone, email })
    if (channelError) {
      return NextResponse.json({ error: channelError, code: 'reminder_channel_contact' }, { status: 422 })
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

    // Nationality (ISO 3166-1 alpha-2) drives SST; a MyKad holder defaults to MY.
    const parsedNationality = parseNationality(nationality)
    if (parsedNationality === 'invalid') {
      return NextResponse.json(
        { error: 'Invalid nationality. Use a 2-letter ISO country code (e.g. MY, SG).' },
        { status: 400 }
      )
    }
    const resolvedNationality = parsedNationality ?? (isValidMyKad(icNumber) ? 'MY' : null)

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

    // Get user's active branch + ALL memberships (so we can resolve the role
    // for the branch this patient will actually be created in, not the
    // arbitrary first membership).
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        activeBranchId: true,
        branchMemberships: {
          select: { branchId: true, role: true },
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
      await prisma.user.update({
        where: { id: session.user.id },
        data: { activeBranchId: branchId },
      })
    }

    // Resolve the caller's role within THIS branch (not branchMemberships[0]).
    const membershipInBranch = user?.branchMemberships.find((m) => m.branchId === branchId)
    // A brand-new branch was just created with the caller as OWNER.
    const callerRole = membershipInBranch?.role ?? 'OWNER'
    const clinical = can(callerRole, 'clinical.read')

    // Resolve assigned doctor. Front desk doesn't treat patients, so they must
    // pick one.
    let assignedDoctorId = session.user.id
    if (!clinical && !doctorId) {
      return NextResponse.json(
        { error: 'Choose the doctor for this patient.' },
        { status: 400 }
      )
    }
    if (doctorId && can(callerRole, 'patient.assignDoctor')) {
      // Verify doctorId is a branch member who treats patients
      const isMember = await prisma.branchMember.findUnique({
        where: { userId_branchId: { userId: doctorId, branchId } },
        select: { role: true },
      })
      if (!isMember || !can(isMember.role, 'clinical.read')) {
        return NextResponse.json(
          { error: 'Assigned doctor must be a member of the branch.' },
          { status: 400 }
        )
      }
      assignedDoctorId = doctorId
    }

    // IC numbers are unique across the system. A repeat is usually a double
    // submit or a re-entered patient; only name the match inside this branch.
    const ic = typeof icNumber === 'string' ? icNumber.trim() : ''
    if (ic) {
      const existing = await prisma.patient.findUnique({
        where: { icNumber: ic },
        select: { id: true, firstName: true, lastName: true, branchId: true },
      })
      if (existing) {
        const sameBranch = existing.branchId === branchId
        return NextResponse.json(
          {
            error: sameBranch
              ? `A patient with this IC number already exists (${existing.firstName} ${existing.lastName}).`
              : 'This IC number is already registered to a patient in another branch.',
            code: 'duplicate_patient',
            ...(sameBranch ? { patientId: existing.id } : {}),
          },
          { status: 409 }
        )
      }
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
        nationality: resolvedNationality,
        emergencyName: emergencyName?.trim() || null,
        emergencyPhone: emergencyPhone?.trim() || null,
        emergencyRelation: emergencyRelation || null,
        // Clinical fields are ignored for front desk.
        medicalHistory: clinical ? medicalHistory || null : null,
        notes: clinical ? notes || null : null,
        initialTreatmentFee: typeof initialTreatmentFee === 'number' ? initialTreatmentFee : null,
        firstTreatmentFee: typeof firstTreatmentFee === 'number' ? firstTreatmentFee : null,
        standardFollowUpFee: typeof standardFollowUpFee === 'number' ? standardFollowUpFee : null,
        status: 'active',
        reminderChannel: resolvedReminderChannel,
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
            thumbnailUrl: true, createdAt: true,
            // The viewer counts the shapes on the latest annotation — show the same number.
            annotations: { orderBy: { updatedAt: 'desc' }, take: 1, select: { shapeCount: true } },
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
          select: { id: true, dateTime: true, status: true, doctorId: true, duration: true, notes: true },
        },
      },
    })

    return NextResponse.json(
      redactClinicalFields(callerRole, mapPatientToResponse(patient)),
      { status: 201 }
    )
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
