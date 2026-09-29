import type { BranchRole, Prisma } from "@prisma/client";

/**
 * Who treats patients (calendar columns, bookable doctors, doctor counts).
 * DOCTOR and OWNER members always do. An ADMIN does when they have a doctor
 * profile (licence, schedule) — a manager who also treats; admins without
 * one are office staff. FRONT_DESK never does. Client-safe.
 */
const ALWAYS_CLINICIAN: BranchRole[] = ["DOCTOR", "OWNER"];

export function isClinician(role: BranchRole, hasDoctorProfile: boolean): boolean {
  return ALWAYS_CLINICIAN.includes(role) || (role === "ADMIN" && hasDoctorProfile);
}

/** BranchMember filter for clinicians, whether or not their profile is active. */
export function clinicianRoleWhere(): Prisma.BranchMemberWhereInput {
  return {
    OR: [
      { role: { in: ALWAYS_CLINICIAN } },
      { role: "ADMIN", user: { doctorProfile: { isNot: null } } },
    ],
  };
}

/** BranchMember filter for clinicians whose doctor profile isn't deactivated. */
export function activeClinicianWhere(): Prisma.BranchMemberWhereInput {
  return {
    AND: [
      clinicianRoleWhere(),
      { user: { OR: [{ doctorProfile: null }, { doctorProfile: { isActive: true } }] } },
    ],
  };
}
