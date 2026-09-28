import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CLINICIAN_ROLES } from "@/lib/clinician";

export { CLINICIAN_ROLES, isClinicianRole } from "@/lib/clinician";

/**
 * One definition of the headline counts, shared by the dashboard, branch
 * cards, branches list, doctors page and patients page so they always agree.
 *
 * - Clinician: a distinct user who is a DOCTOR or OWNER member of the scoped
 *   branches and whose doctor profile isn't deactivated. Front-desk ADMINs
 *   are staff, not clinicians. Same rule as `/api/doctors?clinical=1`.
 * - Patients: every patient in the scoped branches, whatever their status.
 *   "Active patients" is always labelled as such and filters status.
 */

export function clinicianMemberWhere(branchIds: string[]): Prisma.BranchMemberWhereInput {
  return {
    branchId: { in: branchIds },
    role: { in: CLINICIAN_ROLES },
    user: { OR: [{ doctorProfile: null }, { doctorProfile: { isActive: true } }] },
  };
}

/** Distinct active clinicians across `branchIds`. */
export async function countClinicians(branchIds: string[]): Promise<number> {
  if (branchIds.length === 0) return 0;
  const rows = await prisma.branchMember.findMany({
    where: clinicianMemberWhere(branchIds),
    distinct: ["userId"],
    select: { userId: true },
  });
  return rows.length;
}

/** Active clinician user ids per branch, for branch cards. */
export async function cliniciansByBranch(branchIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>(branchIds.map((id) => [id, []]));
  if (branchIds.length === 0) return out;
  const rows = await prisma.branchMember.findMany({
    where: clinicianMemberWhere(branchIds),
    select: { branchId: true, userId: true },
  });
  for (const r of rows) out.get(r.branchId)?.push(r.userId);
  return out;
}

export const ACTIVE_PATIENT_STATUS = "active";

export function patientScopeWhere(branchIds: string[], activeOnly = false): Prisma.PatientWhereInput {
  return {
    branchId: { in: branchIds },
    ...(activeOnly ? { status: ACTIVE_PATIENT_STATUS } : {}),
  };
}
