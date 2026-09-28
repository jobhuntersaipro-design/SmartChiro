/**
 * API payloads for packages, care plans and recurring appointment series
 * (Phase 3). Dates are ISO strings; `…Date` fields that are calendar days are
 * "YYYY-MM-DD" in the clinic time zone. Money is MYR as a number (2 dp).
 */

export type TreatmentTypeValue =
  | "INITIAL_CONSULT"
  | "ADJUSTMENT"
  | "GONSTEAD"
  | "DIVERSIFIED"
  | "ACTIVATOR"
  | "DROP_TABLE"
  | "SOFT_TISSUE"
  | "SPINAL_DECOMPRESSION"
  | "REHAB_EXERCISE"
  | "X_RAY"
  | "FOLLOW_UP"
  | "WELLNESS_CHECK"
  | "PEDIATRIC"
  | "PRENATAL"
  | "SPORTS_REHAB"
  | "OTHER";

export type PackageStatusValue = "ACTIVE" | "COMPLETED" | "EXPIRED" | "CANCELLED";
export type CarePlanStatusValue = "ACTIVE" | "COMPLETED" | "CANCELLED";

export interface PackageTemplateJson {
  id: string;
  branchId: string;
  name: string;
  description: string | null;
  sessions: number;
  price: number;
  /** Price / sessions, rounded to sen. */
  unitValue: number;
  validityDays: number | null;
  /** Empty = any treatment type redeems it. */
  treatmentTypes: TreatmentTypeValue[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserRefJson {
  id: string;
  name: string | null;
}

export interface PackageRedemptionJson {
  id: string;
  appointmentId: string;
  appointment: {
    dateTime: string;
    status: string;
    treatmentType: TreatmentTypeValue | null;
    doctorName: string | null;
  } | null;
  redeemedAt: string;
  redeemedBy: UserRefJson | null;
  reversedAt: string | null;
  reversedBy: UserRefJson | null;
}

export interface PatientPackageJson {
  id: string;
  patientId: string;
  branchId: string;
  templateId: string | null;
  name: string;
  sessionsTotal: number;
  sessionsUsed: number;
  sessionsLeft: number;
  price: number;
  unitValue: number;
  treatmentTypes: TreatmentTypeValue[];
  purchasedAt: string;
  expiresAt: string | null;
  /** Stored status. */
  status: PackageStatusValue;
  /** What to show: ACTIVE past expiry reads EXPIRED, used up reads COMPLETED. */
  effectiveStatus: PackageStatusValue;
  soldBy: UserRefJson | null;
  invoice: { id: string; invoiceNumber: string; status: string; amount: number } | null;
  notes: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Newest first; reversed rows are kept as history. Omitted in list-light payloads. */
  redemptions?: PackageRedemptionJson[];
  createdAt: string;
}

/** Shown on an appointment: "Package: 5 of 12 used" + Undo. */
export interface RedemptionSummaryJson {
  id: string;
  appointmentId: string;
  patientPackageId: string;
  packageName: string;
  sessionsUsed: number;
  sessionsTotal: number;
  sessionsLeft: number;
  redeemedAt: string;
}

export type OccurrenceProblem = "conflict" | "break" | "outside_hours" | "past" | "time_off";

export interface OccurrenceConflictJson {
  id: string;
  dateTime: string;
  duration: number;
  patient: { firstName: string; lastName: string };
}

export interface OccurrenceCheckJson {
  dateTime: string;
  ok: boolean;
  problems: OccurrenceProblem[];
  conflicts?: OccurrenceConflictJson[];
  /** Label of the doctor's break (when `break`). */
  breakLabel?: string;
  /** Opening hours of that clinic day, e.g. "Sat 9:00 AM–1:00 PM" or "Closed on Sunday" (when `outside_hours`). */
  hours?: string;
}

export interface SeriesRuleJson {
  /** 0 = Sunday … 6 = Saturday, clinic time. */
  weekdays: number[];
  /** "HH:MM" clinic time. */
  startTime: string;
  intervalWeeks: number;
  count: number | null;
  /** "YYYY-MM-DD", inclusive. */
  until: string | null;
  /** "YYYY-MM-DD". */
  startDate: string;
}

export interface SeriesAppointmentJson {
  id: string;
  seriesIndex: number | null;
  dateTime: string;
  duration: number;
  status: string;
  doctorId: string;
  treatmentType: TreatmentTypeValue | null;
  /** Paid by a package session (GET /api/appointment-series/[id] only). */
  redeemed?: boolean;
}

export interface AppointmentSeriesJson extends SeriesRuleJson {
  id: string;
  patientId: string;
  branchId: string;
  doctor: UserRefJson;
  treatmentType: TreatmentTypeValue | null;
  duration: number;
  room: string | null;
  carePlanId: string | null;
  patientPackageId: string | null;
  createdAt: string;
  appointments?: SeriesAppointmentJson[];
}

export interface CarePlanProgressJson {
  /** Appointments of the plan's series marked COMPLETED. */
  completed: number;
  /** Booked and still to come (SCHEDULED / CHECKED_IN / IN_PROGRESS). */
  upcoming: number;
  cancelled: number;
  noShow: number;
  /** = plan.totalVisits */
  planned: number;
}

export interface CarePlanJson {
  id: string;
  patientId: string;
  branchId: string;
  doctor: UserRefJson;
  title: string;
  visitsPerWeek: number;
  totalVisits: number;
  /** "YYYY-MM-DD". */
  startDate: string;
  goals: string | null;
  status: CarePlanStatusValue;
  patientPackageId: string | null;
  package: Pick<PatientPackageJson, "id" | "name" | "sessionsTotal" | "sessionsUsed" | "sessionsLeft" | "effectiveStatus" | "expiresAt"> | null;
  seriesIds: string[];
  progress: CarePlanProgressJson;
  createdAt: string;
  updatedAt: string;
}
