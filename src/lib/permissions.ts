import type { BranchRole } from "@prisma/client";

/**
 * One role → capability map for the whole app, used by API routes and UI.
 * Client-safe: no Prisma runtime import.
 *
 * Capabilities are per branch role. "Own patients only" scoping for DOCTOR is
 * separate: `patient.readAll` / `appointment.manageAll` say whether a role
 * works across every patient / doctor in the branch or only their own.
 */
export type Capability =
  /** See every patient in the branch (DOCTOR sees only assigned patients). */
  | "patient.readAll"
  /** Create patients and edit demographics / contact details. */
  | "patient.write"
  /** Pick or change a patient's assigned doctor. */
  | "patient.assignDoctor"
  | "patient.delete"
  /** medicalHistory / notes, visits, SOAP, questionnaires, vitals, recovery. */
  | "clinical.read"
  | "clinical.write"
  /** X-rays, annotations, exports, compare, notes, landmark detection. */
  | "xray.read"
  | "xray.write"
  /** Book, reschedule, check in / start / complete / no-show, cancel. */
  | "appointment.write"
  /** Book or edit appointments for any doctor in the branch. */
  | "appointment.manageAll"
  /** Hard delete (everyone else cancels). */
  | "appointment.delete"
  /** Issue invoices, mark sent / paid, cancel, regenerate. */
  | "invoice.manage"
  /** Edit or delete the branch itself. */
  | "branch.manage"
  /** Add / remove staff. */
  | "staff.manage"
  /** Other doctors' breaks and time off. */
  | "schedule.manageAll"
  | "reminders.manage"
  | "audit.read"
  /** Visits, X-rays and recovery numbers on the dashboard. */
  | "dashboard.clinicalStats"
  /** Revenue, receivables, utilisation, packages and retention reports. */
  | "reports.read"
  /** Package catalogue, cancelling sold packages (selling is `invoice.manage`). */
  | "package.manage";

const ALL: readonly Capability[] = [
  "patient.readAll",
  "patient.write",
  "patient.assignDoctor",
  "patient.delete",
  "clinical.read",
  "clinical.write",
  "xray.read",
  "xray.write",
  "appointment.write",
  "appointment.manageAll",
  "appointment.delete",
  "invoice.manage",
  "branch.manage",
  "staff.manage",
  "schedule.manageAll",
  "reminders.manage",
  "audit.read",
  "dashboard.clinicalStats",
  "reports.read",
  "package.manage",
];

export const ROLE_CAPABILITIES: Record<BranchRole, readonly Capability[]> = {
  OWNER: ALL,
  // ADMIN keeps what it had: everything except editing / deleting the branch.
  ADMIN: ALL.filter((c) => c !== "branch.manage"),
  DOCTOR: [
    "patient.write",
    "clinical.read",
    "clinical.write",
    "xray.read",
    "xray.write",
    "appointment.write",
    "dashboard.clinicalStats",
  ],
  // Books, checks in and takes payment; never sees clinical data.
  FRONT_DESK: [
    "patient.readAll",
    "patient.write",
    "patient.assignDoctor",
    "appointment.write",
    "appointment.manageAll",
    "invoice.manage",
  ],
};

/** Some UI props carry the role as a plain string; unknown roles get nothing. */
export function can(role: BranchRole | string | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role as BranchRole]?.includes(capability) ?? false;
}

export const ROLE_LABELS: Record<BranchRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  DOCTOR: "Doctor",
  FRONT_DESK: "Front desk",
};

export function roleLabel(role: BranchRole | string | null | undefined): string {
  if (!role) return "";
  return ROLE_LABELS[role as BranchRole] ?? role;
}

/** Roles that can be given when adding staff (ownership is transferred, not granted). */
export const ASSIGNABLE_STAFF_ROLES: BranchRole[] = ["DOCTOR", "ADMIN", "FRONT_DESK"];

export const CLINICAL_PATIENT_FIELDS = ["medicalHistory", "notes"] as const;

/** Drops the clinical fields from a patient payload when the role may not see them. */
export function redactClinicalFields<T extends object>(
  role: BranchRole | null | undefined,
  patient: T,
): T {
  if (can(role, "clinical.read")) return patient;
  const copy = { ...patient } as Record<string, unknown>;
  for (const field of CLINICAL_PATIENT_FIELDS) delete copy[field];
  return copy as T;
}
