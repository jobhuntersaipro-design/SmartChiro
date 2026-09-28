import type { BranchRole } from "@prisma/client";

/** Roles that treat patients. ADMIN is front-desk / management staff. Client-safe. */
export const CLINICIAN_ROLES: BranchRole[] = ["DOCTOR", "OWNER"];

export function isClinicianRole(role: BranchRole): boolean {
  return CLINICIAN_ROLES.includes(role);
}
