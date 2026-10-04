import type { BranchRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";

export interface PatientAccess {
  patient: { id: string; branchId: string; doctorId: string; nationality: string | null } | null;
  /** The caller's role in the patient's branch (null when not a member). */
  role: BranchRole | null;
  /** May see the patient's demographics / contact details. */
  allowed: boolean;
  /** May see the patient's clinical record (medical history, visits, X-rays). */
  clinical: boolean;
}

/**
 * The patient routes' access rule: the assigned doctor (while still a member
 * of the patient's branch), or a member of the
 * patient's branch whose role works across every patient (OWNER, ADMIN,
 * FRONT_DESK). FRONT_DESK gets demographics only — `clinical` is false.
 */
export async function getPatientAccess(userId: string, patientId: string): Promise<PatientAccess> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, branchId: true, doctorId: true, nationality: true },
  });
  if (!patient) return { patient: null, role: null, allowed: false, clinical: false };

  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId: patient.branchId } },
    select: { role: true },
  });
  const role = membership?.role ?? null;

  // The assigned doctor only while they still work in the patient's branch:
  // a removed doctor loses access to the patients they were assigned.
  const isAssigned = role !== null && patient.doctorId === userId;
  const allowed = isAssigned || can(role, "patient.readAll");
  const clinical = allowed && can(role, "clinical.read");
  return { patient, role, allowed, clinical };
}
