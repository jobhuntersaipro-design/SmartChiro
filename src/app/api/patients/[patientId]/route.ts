import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ patientId: string }> };

const VALID_BLOOD_TYPES = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
const VALID_MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed"];
const IC_REGEX = /^\d{6}-?\d{2}-?\d{4}$/;

async function checkPatientAccess(userId: string, patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, branchId: true, doctorId: true },
  });

  if (!patient) return { patient: null, allowed: false };

  // Assigned doctor always has access
  if (patient.doctorId === userId) return { patient, allowed: true };

  // OWNER or ADMIN of the patient's branch has access
  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId: patient.branchId } },
  });

  if (membership && (membership.role === "OWNER" || membership.role === "ADMIN")) {
    return { patient, allowed: true };
  }

  return { patient, allowed: false };
}

export async function GET(
  req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patientId } = await params;
  const { patient: patientRef, allowed } = await checkPatientAccess(session.user.id, patientId);

  if (!patientRef) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const includeDetail = url.searchParams.get("include") === "detail";

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      doctor: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      _count: { select: { visits: true, xrays: true, appointments: true, documents: true } },
      visits: {
        select: { id: true, visitDate: true, subjective: true, visitType: true },
        orderBy: { visitDate: "desc" },
        take: 5,
      },
      xrays: {
        select: {
          id: true, title: true, bodyRegion: true, viewType: true, status: true,
          thumbnailUrl: true, createdAt: true,
          _count: { select: { annotations: true } },
          notes: {
            take: 1, orderBy: { createdAt: "desc" },
            select: { bodyMd: true },
          },
        },
        where: { status: { in: ["READY", "ARCHIVED"] } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  // Build detail stats if requested
  let recoveryTrend: number | null = null;
  let nextAppointment: string | null = null;
  let visitsByType: Record<string, number> | null = null;
  let activePackages:
    | {
        id: string;
        packageName: string;
        sessionsTotal: number;
        sessionsUsed: number;
        sessionsRemaining: number;
        expiresAt: string | null;
        status: string;
      }[]
    | null = null;

  if (includeDetail) {
    // Recovery trend: average overallImprovement from last 5 questionnaires
    const recentQuestionnaires = await prisma.visitQuestionnaire.findMany({
      where: { visit: { patientId } },
      orderBy: { visit: { visitDate: "desc" } },
      take: 5,
      select: { overallImprovement: true },
    });

    if (recentQuestionnaires.length > 0) {
      const sum = recentQuestionnaires.reduce((acc, q) => acc + q.overallImprovement, 0);
      recoveryTrend = Math.round((sum / recentQuestionnaires.length) * 10) / 10;
    }

    // Next upcoming appointment
    const upcoming = await prisma.appointment.findFirst({
      where: {
        patientId,
        dateTime: { gte: new Date() },
        status: { in: ["SCHEDULED", "CHECKED_IN"] },
      },
      orderBy: { dateTime: "asc" },
      select: { dateTime: true },
    });
    nextAppointment = upcoming?.dateTime.toISOString() ?? null;

    // Visit counts by type
    const allVisits = await prisma.visit.findMany({
      where: { patientId },
      select: { visitType: true },
    });
    visitsByType = {
      INITIAL_CONSULTATION: 0,
      FIRST_TREATMENT: 0,
      FOLLOW_UP: 0,
      RE_EVALUATION: 0,
      EMERGENCY: 0,
      DISCHARGE: 0,
      OTHER: 0,
    };
    for (const v of allVisits) {
      const t = (v.visitType ?? "OTHER") as keyof typeof visitsByType;
      if (visitsByType[t] !== undefined) visitsByType[t]++;
    }

    // Active patient packages (most recent first)
    const packages = await prisma.patientPackage.findMany({
      where: { patientId, status: "ACTIVE" },
      orderBy: { purchasedAt: "desc" },
      include: { package: { select: { name: true } } },
    });
    activePackages = packages.map((p) => ({
      id: p.id,
      packageName: p.package.name,
      sessionsTotal: p.sessionsTotal,
      sessionsUsed: p.sessionsUsed,
      sessionsRemaining: Math.max(0, p.sessionsTotal - p.sessionsUsed),
      expiresAt: p.expiresAt?.toISOString() ?? null,
      status: p.status,
    }));
  }

  return NextResponse.json({
    patient: {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
      phone: patient.phone,
      icNumber: patient.icNumber,
      dateOfBirth: patient.dateOfBirth?.toISOString() ?? null,
      gender: patient.gender,
      occupation: patient.occupation,
      race: patient.race,
      maritalStatus: patient.maritalStatus,
      bloodType: patient.bloodType,
      allergies: patient.allergies,
      referralSource: patient.referralSource,
      initialTreatmentFee: patient.initialTreatmentFee,
      firstTreatmentFee: patient.firstTreatmentFee,
      standardFollowUpFee: patient.standardFollowUpFee,
      addressLine1: patient.addressLine1,
      addressLine2: patient.addressLine2,
      city: patient.city,
      state: patient.state,
      postcode: patient.postcode,
      country: patient.country,
      emergencyName: patient.emergencyName,
      emergencyPhone: patient.emergencyPhone,
      emergencyRelation: patient.emergencyRelation,
      address: patient.address,
      emergencyContact: patient.emergencyContact,
      medicalHistory: patient.medicalHistory,
      notes: patient.notes,
      status: patient.status ?? "active",
      doctorId: patient.doctorId,
      doctorName: patient.doctor?.name ?? "Unknown",
      branchId: patient.branchId,
      branchName: patient.branch?.name ?? "Unknown",
      totalVisits: patient._count.visits,
      totalXrays: patient._count.xrays,
      totalAppointments: patient._count.appointments,
      totalDocuments: patient._count.documents,
      recentVisits: patient.visits.map((v) => ({
        id: v.id,
        visitDate: v.visitDate.toISOString(),
        subjective: v.subjective,
        visitType: v.visitType,
      })),
      xrays: patient.xrays.map((x) => ({
        id: x.id,
        title: x.title,
        bodyRegion: x.bodyRegion,
        viewType: x.viewType,
        status: x.status,
        thumbnailUrl: x.thumbnailUrl,
        createdAt: x.createdAt.toISOString(),
        annotationCount: x._count.annotations,
        hasNotes: x.notes.length > 0,
        notePreview: x.notes[0]?.bodyMd?.slice(0, 80) ?? null,
      })),
      createdAt: patient.createdAt.toISOString(),
      updatedAt: patient.updatedAt.toISOString(),
      ...(includeDetail && {
        recoveryTrend,
        nextAppointment,
        visitsByType,
        activePackages,
      }),
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patientId } = await params;
  const { patient: patientRef, allowed } = await checkPatientAccess(session.user.id, patientId);

  if (!patientRef) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    firstName, lastName, email, phone, dateOfBirth,
    gender, address, emergencyContact, medicalHistory, notes, doctorId,
    icNumber, occupation, race, maritalStatus, bloodType, allergies, referralSource,
    addressLine1, addressLine2, city, state, postcode, country,
    emergencyName, emergencyPhone, emergencyRelation, status,
    initialTreatmentFee, firstTreatmentFee, standardFollowUpFee,
  } = body;

  // Validate name fields if provided
  if (firstName !== undefined && (!firstName || !firstName.trim())) {
    return NextResponse.json({ error: "First name cannot be empty" }, { status: 400 });
  }
  if (lastName !== undefined && (!lastName || !lastName.trim())) {
    return NextResponse.json({ error: "Last name cannot be empty" }, { status: 400 });
  }
  if (email !== undefined && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  // Validate IC number
  if (icNumber !== undefined && icNumber && !IC_REGEX.test(icNumber)) {
    return NextResponse.json(
      { error: "Invalid IC number format. Expected 12 digits (YYMMDD-SS-XXXX)." },
      { status: 400 }
    );
  }

  // Validate blood type
  if (bloodType !== undefined && bloodType && !VALID_BLOOD_TYPES.includes(bloodType)) {
    return NextResponse.json(
      { error: `Invalid blood type. Must be one of: ${VALID_BLOOD_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate marital status
  if (maritalStatus !== undefined && maritalStatus && !VALID_MARITAL_STATUSES.includes(maritalStatus)) {
    return NextResponse.json(
      { error: `Invalid marital status. Must be one of: ${VALID_MARITAL_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate doctorId if changing
  if (doctorId !== undefined) {
    const isMember = await prisma.branchMember.findUnique({
      where: { userId_branchId: { userId: doctorId, branchId: patientRef.branchId } },
    });
    if (!isMember) {
      return NextResponse.json(
        { error: "Doctor must be a member of the patient's branch" },
        { status: 400 }
      );
    }
  }

  const updateData: Record<string, unknown> = {};
  if (firstName !== undefined) updateData.firstName = firstName.trim();
  if (lastName !== undefined) updateData.lastName = lastName.trim();
  if (email !== undefined) updateData.email = email?.trim() || null;
  if (phone !== undefined) updateData.phone = phone?.trim() || null;
  if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
  if (gender !== undefined) updateData.gender = gender || null;
  if (address !== undefined) updateData.address = address?.trim() || null;
  if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact?.trim() || null;
  if (medicalHistory !== undefined) updateData.medicalHistory = medicalHistory || null;
  if (notes !== undefined) updateData.notes = notes || null;
  if (doctorId !== undefined) updateData.doctorId = doctorId;
  // New fields
  if (icNumber !== undefined) updateData.icNumber = icNumber?.trim() || null;
  if (occupation !== undefined) updateData.occupation = occupation?.trim() || null;
  if (race !== undefined) updateData.race = race || null;
  if (maritalStatus !== undefined) updateData.maritalStatus = maritalStatus || null;
  if (bloodType !== undefined) updateData.bloodType = bloodType || null;
  if (allergies !== undefined) updateData.allergies = allergies?.trim() || null;
  if (referralSource !== undefined) updateData.referralSource = referralSource || null;
  if (addressLine1 !== undefined) updateData.addressLine1 = addressLine1?.trim() || null;
  if (addressLine2 !== undefined) updateData.addressLine2 = addressLine2?.trim() || null;
  if (city !== undefined) updateData.city = city?.trim() || null;
  if (state !== undefined) updateData.state = state?.trim() || null;
  if (postcode !== undefined) updateData.postcode = postcode?.trim() || null;
  if (country !== undefined) updateData.country = country?.trim() || null;
  if (emergencyName !== undefined) updateData.emergencyName = emergencyName?.trim() || null;
  if (emergencyPhone !== undefined) updateData.emergencyPhone = emergencyPhone?.trim() || null;
  if (emergencyRelation !== undefined) updateData.emergencyRelation = emergencyRelation || null;
  if (status !== undefined) updateData.status = status || null;
  if (initialTreatmentFee !== undefined) {
    updateData.initialTreatmentFee = typeof initialTreatmentFee === 'number' ? initialTreatmentFee : null;
  }
  if (firstTreatmentFee !== undefined) {
    updateData.firstTreatmentFee = typeof firstTreatmentFee === 'number' ? firstTreatmentFee : null;
  }
  if (standardFollowUpFee !== undefined) {
    updateData.standardFollowUpFee = typeof standardFollowUpFee === 'number' ? standardFollowUpFee : null;
  }

  let updated;
  try {
    updated = await prisma.patient.update({
      where: { id: patientId },
      data: updateData,
      include: {
        doctor: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      const target = (err as { meta?: { target?: string[] } }).meta?.target?.join(", ") ?? "field";
      const field = target.includes("email") ? "email address" : target.includes("icNumber") ? "IC number" : target;
      return NextResponse.json(
        { error: `A patient with this ${field} already exists.` },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({
    patient: {
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
      icNumber: updated.icNumber,
      dateOfBirth: updated.dateOfBirth?.toISOString() ?? null,
      gender: updated.gender,
      occupation: updated.occupation,
      race: updated.race,
      maritalStatus: updated.maritalStatus,
      bloodType: updated.bloodType,
      allergies: updated.allergies,
      referralSource: updated.referralSource,
      initialTreatmentFee: updated.initialTreatmentFee,
      firstTreatmentFee: updated.firstTreatmentFee,
      standardFollowUpFee: updated.standardFollowUpFee,
      addressLine1: updated.addressLine1,
      addressLine2: updated.addressLine2,
      city: updated.city,
      state: updated.state,
      postcode: updated.postcode,
      country: updated.country,
      emergencyName: updated.emergencyName,
      emergencyPhone: updated.emergencyPhone,
      emergencyRelation: updated.emergencyRelation,
      address: updated.address,
      emergencyContact: updated.emergencyContact,
      medicalHistory: updated.medicalHistory,
      notes: updated.notes,
      status: updated.status ?? "active",
      doctorId: updated.doctorId,
      doctorName: updated.doctor?.name ?? "Unknown",
      branchId: updated.branchId,
      branchName: updated.branch?.name ?? "Unknown",
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patientId } = await params;
  const { patient, allowed } = await checkPatientAccess(session.user.id, patientId);

  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.patient.delete({ where: { id: patientId } });

  return NextResponse.json({ success: true });
}
