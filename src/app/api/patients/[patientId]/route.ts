import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteR2Prefix, patientR2Prefixes } from "@/lib/r2";
import { reminderChannelError } from "@/lib/reminder-channel";
import { PATIENT_LANGUAGE_VALUES, consentFields } from "@/lib/outreach/consent";
import { getPatientAccess } from "@/lib/auth/patient-access";
import { can } from "@/lib/permissions";
import { isValidMyKad, parseNationality } from "@/lib/invoices";
import { paywall } from "@/lib/paywall";
import { MYKAD_REGEX, normalizeIc } from "@/lib/ic";

type RouteContext = { params: Promise<{ patientId: string }> };

const VALID_BLOOD_TYPES = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
const VALID_MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed"];
const IC_REGEX = MYKAD_REGEX;

export async function GET(
  req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patientId } = await params;
  const { patient: patientRef, allowed, clinical } = await getPatientAccess(session.user.id, patientId);

  if (!patientRef) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const includeDetail = url.searchParams.get("include") === "detail";

  // The patient row and the detail stats are independent — fetch them
  // together instead of one round trip after another.
  const [patient, recentQuestionnaires, upcoming, grouped] = await Promise.all([
    prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        doctor: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        _count: { select: { visits: true, xrays: true, appointments: true, documents: true } },
        // Front desk never receives visit notes or X-rays.
        visits: {
          select: { id: true, visitDate: true, subjective: true, visitType: true, appointmentId: true },
          orderBy: { visitDate: "desc" },
          take: clinical ? 5 : 0,
        },
        xrays: {
          select: {
            id: true, title: true, bodyRegion: true, viewType: true, status: true,
            thumbnailUrl: true, createdAt: true,
            // The viewer counts the shapes on the latest annotation — show the same number.
            annotations: { orderBy: { updatedAt: "desc" }, take: 1, select: { shapeCount: true } },
            notes: {
              take: 1, orderBy: { createdAt: "desc" },
              select: { bodyMd: true },
            },
          },
          where: { status: { in: ["READY", "ARCHIVED"] } },
          orderBy: { createdAt: "desc" },
          take: clinical ? undefined : 0,
        },
      },
    }),
    // Recovery trend: average overallImprovement from last 5 questionnaires
    includeDetail && clinical
      ? prisma.visitQuestionnaire.findMany({
          where: { visit: { patientId } },
          orderBy: { visit: { visitDate: "desc" } },
          take: 5,
          select: { overallImprovement: true },
        })
      : null,
    // Next upcoming appointment
    includeDetail
      ? prisma.appointment.findFirst({
          where: {
            patientId,
            dateTime: { gte: new Date() },
            status: { in: ["SCHEDULED", "CHECKED_IN"] },
          },
          orderBy: { dateTime: "asc" },
          select: { dateTime: true },
        })
      : null,
    // Visit counts by type — let Postgres aggregate instead of loading every
    // visit row into Node.
    includeDetail && clinical
      ? prisma.visit.groupBy({
          by: ["visitType"],
          where: { patientId },
          _count: { _all: true },
        })
      : null,
  ]);

  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  let recoveryTrend: number | null = null;
  let nextAppointment: string | null = null;
  let visitsByType: Record<string, number> | null = null;

  if (includeDetail) {
    if (recentQuestionnaires && recentQuestionnaires.length > 0) {
      const sum = recentQuestionnaires.reduce((acc, q) => acc + q.overallImprovement, 0);
      recoveryTrend = Math.round((sum / recentQuestionnaires.length) * 10) / 10;
    }
    nextAppointment = upcoming?.dateTime.toISOString() ?? null;
    visitsByType = {
      initial: 0,
      follow_up: 0,
      emergency: 0,
      reassessment: 0,
      discharge: 0,
    };
    for (const row of grouped ?? []) {
      const t = row.visitType ?? "follow_up";
      if (t in visitsByType) visitsByType[t] = row._count._all;
    }
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
      nationality: patient.nationality,
      passportNumber: patient.passportNumber,
      emergencyName: patient.emergencyName,
      emergencyPhone: patient.emergencyPhone,
      emergencyRelation: patient.emergencyRelation,
      address: patient.address,
      emergencyContact: patient.emergencyContact,
      ...(clinical && { medicalHistory: patient.medicalHistory, notes: patient.notes }),
      status: patient.status ?? "active",
      reminderChannel: patient.reminderChannel,
      preferredLanguage: patient.preferredLanguage,
      marketingConsent: patient.marketingConsent,
      marketingConsentAt: patient.marketingConsentAt?.toISOString() ?? null,
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
        appointmentId: v.appointmentId,
      })),
      xrays: patient.xrays.map((x) => ({
        id: x.id,
        title: x.title,
        bodyRegion: x.bodyRegion,
        viewType: x.viewType,
        status: x.status,
        thumbnailUrl: x.thumbnailUrl,
        createdAt: x.createdAt.toISOString(),
        annotationCount: x.annotations[0]?.shapeCount ?? 0,
        hasNotes: x.notes.length > 0,
        notePreview: x.notes[0]?.bodyMd?.slice(0, 80) ?? null,
      })),
      createdAt: patient.createdAt.toISOString(),
      updatedAt: patient.updatedAt.toISOString(),
      ...(includeDetail && {
        nextAppointment,
        ...(clinical && { recoveryTrend, visitsByType }),
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
  const blocked = await paywall(session.user.id);
  if (blocked) return blocked;

  const { patientId } = await params;
  const {
    patient: patientRef, allowed, clinical, role: callerRole,
  } = await getPatientAccess(session.user.id, patientId);

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
    reminderChannel, preferredLanguage, nationality, marketingConsent, passportNumber,
  } = body;

  const VALID_REMINDER_CHANNELS = ["WHATSAPP", "EMAIL", "BOTH", "NONE"] as const;
  const VALID_LANGUAGES = PATIENT_LANGUAGE_VALUES;
  const VALID_PATIENT_STATUSES = ["active", "inactive", "discharged"] as const;
  if (reminderChannel !== undefined && reminderChannel !== null && !VALID_REMINDER_CHANNELS.includes(reminderChannel)) {
    return NextResponse.json(
      { error: `Invalid reminderChannel. Must be one of: ${VALID_REMINDER_CHANNELS.join(", ")}` },
      { status: 400 }
    );
  }
  if (preferredLanguage !== undefined && preferredLanguage !== null && !VALID_LANGUAGES.includes(preferredLanguage)) {
    return NextResponse.json(
      { error: `Invalid preferredLanguage. Must be one of: ${VALID_LANGUAGES.join(", ")}` },
      { status: 400 }
    );
  }
  if (marketingConsent !== undefined && typeof marketingConsent !== "boolean") {
    return NextResponse.json({ error: "marketingConsent must be true or false" }, { status: 400 });
  }
  if (status !== undefined && status !== null && !VALID_PATIENT_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_PATIENT_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

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

  // Reminder channel vs contact details, judged on the record as it will be after this update
  if (reminderChannel !== undefined || phone !== undefined || email !== undefined) {
    const current = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { reminderChannel: true, phone: true, email: true },
    });
    const merged = {
      channel: reminderChannel ?? current?.reminderChannel,
      phone: phone !== undefined ? phone : current?.phone,
      email: email !== undefined ? email : current?.email,
    };
    const channelError = reminderChannelError(merged.channel, merged);
    if (channelError) {
      return NextResponse.json({ error: channelError, code: "reminder_channel_contact" }, { status: 422 });
    }
  }

  // Validate IC number
  if (icNumber !== undefined && icNumber && !IC_REGEX.test(icNumber)) {
    return NextResponse.json(
      { error: "Invalid IC number format. Expected 12 digits (YYMMDD-SS-XXXX)." },
      { status: 400 }
    );
  }

  // Nationality (ISO 3166-1 alpha-2) drives SST.
  const parsedNationality = nationality === undefined ? undefined : parseNationality(nationality);
  if (parsedNationality === "invalid") {
    return NextResponse.json(
      { error: "Invalid nationality. Use a 2-letter ISO country code (e.g. MY, SG)." },
      { status: 400 }
    );
  }

  // Passport no. (non-Malaysian buyer ID on LHDN e-invoices)
  if (passportNumber !== undefined && passportNumber !== null && (typeof passportNumber !== "string" || !/^[A-Za-z0-9]{0,20}$/.test(passportNumber.trim()))) {
    return NextResponse.json({ error: "Invalid passport number (letters and digits, up to 20)." }, { status: 400 });
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

  // Validate doctorId if changing — reassignment requires OWNER/ADMIN/FRONT_DESK
  // in the patient's branch. A DOCTOR who happens to be the patient's currently
  // assigned doctor should not be able to hand them off to anyone else.
  if (doctorId !== undefined) {
    if (!can(callerRole, "patient.assignDoctor")) {
      return NextResponse.json(
        { error: "Only OWNER, ADMIN or front desk can reassign the patient's doctor" },
        { status: 403 }
      );
    }
    const isMember = await prisma.branchMember.findUnique({
      where: { userId_branchId: { userId: doctorId, branchId: patientRef.branchId } },
      select: { role: true },
    });
    // Front desk staff don't treat patients, so they can't be the assigned doctor.
    if (!isMember || !can(isMember.role, "clinical.read")) {
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
  // Clinical fields are ignored for roles that can't see them (front desk).
  if (clinical && medicalHistory !== undefined) updateData.medicalHistory = medicalHistory || null;
  if (clinical && notes !== undefined) updateData.notes = notes || null;
  if (doctorId !== undefined) updateData.doctorId = doctorId;
  // New fields
  if (icNumber !== undefined) updateData.icNumber = normalizeIc(icNumber);
  if (passportNumber !== undefined) updateData.passportNumber = passportNumber?.trim().toUpperCase() || null;
  if (parsedNationality !== undefined) {
    updateData.nationality = parsedNationality;
  } else if (!patientRef.nationality && isValidMyKad(icNumber)) {
    // A MyKad entered with no nationality on file: Malaysian.
    updateData.nationality = "MY";
  }
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
  if (reminderChannel !== undefined) updateData.reminderChannel = reminderChannel;
  if (preferredLanguage !== undefined) updateData.preferredLanguage = preferredLanguage;
  if (marketingConsent !== undefined) {
    const current = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { marketingConsent: true, marketingConsentAt: true },
    });
    Object.assign(updateData, consentFields(marketingConsent, current));
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
      nationality: updated.nationality,
      passportNumber: updated.passportNumber,
      emergencyName: updated.emergencyName,
      emergencyPhone: updated.emergencyPhone,
      emergencyRelation: updated.emergencyRelation,
      address: updated.address,
      emergencyContact: updated.emergencyContact,
      ...(clinical && { medicalHistory: updated.medicalHistory, notes: updated.notes }),
      status: updated.status ?? "active",
      reminderChannel: updated.reminderChannel,
      preferredLanguage: updated.preferredLanguage,
      marketingConsent: updated.marketingConsent,
      marketingConsentAt: updated.marketingConsentAt?.toISOString() ?? null,
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
  const blocked = await paywall(session.user.id);
  if (blocked) return blocked;

  const { patientId } = await params;
  const { patient, allowed, role } = await getPatientAccess(session.user.id, patientId);

  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Deleting cascades to visits, X-rays, annotations and invoices — only the
  // branch's OWNER/ADMIN may do it, not the assigned doctor or front desk.
  if (!can(role, "patient.delete")) {
    return NextResponse.json({ error: "Only the branch owner or an admin can delete patients" }, { status: 403 });
  }

  const xrays = await prisma.xray.findMany({ where: { patientId }, select: { fileUrl: true } });
  await prisma.patient.delete({ where: { id: patientId } });

  // The films and exports are public-URL objects: delete them too, so a
  // deleted patient's X-rays can't still be opened. Best effort.
  if (process.env.R2_PUBLIC_URL) {
    try {
      await Promise.all(patientR2Prefixes(patientId, xrays.map((x) => x.fileUrl)).map(deleteR2Prefix));
    } catch (err) {
      console.error(`[patients] R2 files of deleted patient ${patientId} not removed:`, err);
    }
  }

  return NextResponse.json({ success: true });
}
