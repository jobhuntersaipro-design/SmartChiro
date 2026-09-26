import type { BranchRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Patient } from "@/types/patient";

export type ClinicPatientDetail = Patient & {
  branchName: string;
  recoveryTrend: number | null;
  nextAppointment: string | null;
  visitsByType: Record<string, number>;
};

export async function loadPatientDetail(
  userId: string,
  patientId: string,
): Promise<
  | { ok: true; patient: ClinicPatientDetail; branchRole: BranchRole | null }
  | { ok: false; status: 403 | 404 }
> {
  const access = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, branchId: true, doctorId: true },
  });
  if (!access) return { ok: false, status: 404 };

  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId: access.branchId } },
    select: { role: true },
  });
  const allowed =
    access.doctorId === userId ||
    membership?.role === "OWNER" ||
    membership?.role === "ADMIN";
  if (!allowed) return { ok: false, status: 403 };

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      doctor: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      _count: { select: { visits: true, xrays: true, appointments: true, documents: true } },
      visits: {
        select: { id: true, visitDate: true, subjective: true, visitType: true, appointmentId: true },
        orderBy: { visitDate: "desc" },
        take: 5,
      },
      xrays: {
        select: {
          id: true,
          title: true,
          bodyRegion: true,
          viewType: true,
          status: true,
          thumbnailUrl: true,
          createdAt: true,
          _count: { select: { annotations: true } },
          notes: { take: 1, orderBy: { createdAt: "desc" }, select: { bodyMd: true } },
        },
        where: { status: { in: ["READY", "ARCHIVED"] } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!patient) return { ok: false, status: 404 };

  const [recentQuestionnaires, upcoming, grouped] = await Promise.all([
    prisma.visitQuestionnaire.findMany({
      where: { visit: { patientId } },
      orderBy: { visit: { visitDate: "desc" } },
      take: 5,
      select: { overallImprovement: true },
    }),
    prisma.appointment.findFirst({
      where: {
        patientId,
        dateTime: { gte: new Date() },
        status: { in: ["SCHEDULED", "CHECKED_IN"] },
      },
      orderBy: { dateTime: "asc" },
      select: { dateTime: true },
    }),
    prisma.visit.groupBy({
      by: ["visitType"],
      where: { patientId },
      _count: { _all: true },
    }),
  ]);

  let recoveryTrend: number | null = null;
  if (recentQuestionnaires.length > 0) {
    const sum = recentQuestionnaires.reduce((acc, q) => acc + q.overallImprovement, 0);
    recoveryTrend = Math.round((sum / recentQuestionnaires.length) * 10) / 10;
  }

  const visitsByType: Record<string, number> = {
    initial: 0,
    follow_up: 0,
    emergency: 0,
    reassessment: 0,
    discharge: 0,
  };
  for (const row of grouped) {
    const t = row.visitType ?? "follow_up";
    if (t in visitsByType) visitsByType[t] = row._count._all;
  }

  return {
    ok: true,
    branchRole: membership?.role ?? null,
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
      reminderChannel: patient.reminderChannel,
      preferredLanguage: patient.preferredLanguage === "ms" ? "ms" : "en",
      doctorId: patient.doctorId,
      doctorName: patient.doctor?.name ?? "Unknown",
      branchId: patient.branchId,
      branchName: patient.branch?.name ?? "Unknown",
      lastVisit: patient.visits[0]?.visitDate.toISOString() ?? null,
      totalVisits: patient._count.visits,
      totalXrays: patient._count.xrays,
      upcomingAppointment: null,
      createdAt: patient.createdAt.toISOString(),
      xrays: patient.xrays.map((x) => ({
        id: x.id,
        title: x.title,
        bodyRegion: x.bodyRegion,
        viewType: x.viewType,
        status: x.status,
        thumbnailUrl: x.thumbnailUrl,
        annotationCount: x._count.annotations,
        hasNotes: x.notes.length > 0,
        notePreview: x.notes[0]?.bodyMd?.slice(0, 80) ?? null,
        createdAt: x.createdAt.toISOString(),
      })),
      recoveryTrend,
      nextAppointment: upcoming?.dateTime.toISOString() ?? null,
      visitsByType,
    },
  };
}
