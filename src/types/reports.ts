/**
 * Payloads of the /api/reports/* endpoints (Phase 5). Money is MYR as a
 * number with 2 dp; calendar days are "YYYY-MM-DD" in clinic time; instants
 * are ISO strings.
 */

export type ReportSection = "revenue" | "receivables" | "appointments" | "utilisation" | "packages" | "patients";

export interface ReportRangeJson {
  /** First clinic day, inclusive. */
  from: string;
  /** Last clinic day, inclusive. */
  to: string;
  days: number;
}

export interface ReportScopeJson {
  branchIds: string[];
  /** "All branches" or the branch name. */
  label: string;
}

interface ReportBase {
  range: ReportRangeJson;
  scope: ReportScopeJson;
}

export type Granularity = "day" | "week";

export interface TrendPoint {
  /** Bucket start "YYYY-MM-DD" (a Monday for weekly buckets). */
  key: string;
  /** First and last clinic day of the bucket inside the range. */
  from: string;
  to: string;
  collected: number;
  invoiced: number;
}

/** "doctor" = the appointment's doctor; the other two are fixed attribution rows. */
export type AttributionKind = "doctor" | "no_appointment" | "package_sales";

export interface RevenueRow {
  key: string;
  name: string;
  collected: number;
  invoiced: number;
}

export interface DoctorRevenueRow extends RevenueRow {
  kind: AttributionKind;
}

export interface RevenueReport extends ReportBase {
  granularity: Granularity;
  totals: {
    /** Payments received in range, net of refunds. */
    collected: number;
    /** Refunds in range (a positive number, already netted off `collected`). */
    refunds: number;
    payments: number;
    /** Invoices issued in range, excluding drafts and cancelled ones. */
    invoiced: number;
    invoices: number;
  };
  trend: TrendPoint[];
  byBranch: RevenueRow[];
  byDoctor: DoctorRevenueRow[];
  byTreatment: RevenueRow[];
}

export interface OverdueInvoiceRow {
  id: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  branchName: string;
  issuedAt: string;
  dueDate: string;
  daysOverdue: number;
  total: number;
  balance: number;
}

export interface ReceivablesReport extends ReportBase {
  /** Snapshot time — receivables are as of now, not the range. */
  asOf: string;
  open: { balance: number; count: number };
  overdue: { balance: number; count: number };
  oldestOverdue: OverdueInvoiceRow[];
}

export interface AppointmentCounts {
  booked: number;
  completed: number;
  cancelled: number;
  noShow: number;
  /** Still scheduled / checked in / in progress. */
  open: number;
  /** noShow ÷ (completed + noShow); null when nothing was completed or missed. */
  noShowRate: number | null;
  /** cancelled ÷ booked; null when nothing was booked. */
  cancellationRate: number | null;
}

export interface DoctorAppointmentRow extends AppointmentCounts {
  doctorId: string;
  name: string;
}

export interface AppointmentsReport extends ReportBase {
  totals: AppointmentCounts;
  byDoctor: DoctorAppointmentRow[];
}

export interface UtilisationRow {
  doctorId: string;
  name: string;
  bookedMinutes: number;
  availableMinutes: number;
  /** booked ÷ available; null when the doctor had no available time. */
  rate: number | null;
  /** Where the working hours came from. */
  hoursSource: "schedule" | "branch_hours" | "none";
}

export interface UtilisationReport extends ReportBase {
  totals: { bookedMinutes: number; availableMinutes: number; rate: number | null };
  byDoctor: UtilisationRow[];
}

export interface PackageLiabilityRow {
  name: string;
  active: number;
  sessionsLeft: number;
  liability: number;
  expiringSoon: number;
}

export interface PackagesReport extends ReportBase {
  asOf: string;
  active: number;
  sessionsOutstanding: number;
  liability: number;
  expiringSoon: { count: number; sessions: number; liability: number };
  sold: { count: number; value: number };
  byPackage: PackageLiabilityRow[];
}

export interface LapsedPatientRow {
  id: string;
  name: string;
  phone: string | null;
  branchName: string;
  lastVisit: string;
}

export interface PatientsReport extends ReportBase {
  asOf: string;
  newPatients: number;
  /** Distinct patients with a visit in range. */
  seen: number;
  /** Seen in range and with an earlier visit before the range. */
  returning: number;
  lapsed: number;
  lapsedAfterDays: number;
  /** Most recently lapsed first (the likeliest to come back), capped. */
  lapsedList: LapsedPatientRow[];
}

export type ReportPayload = {
  revenue: RevenueReport;
  receivables: ReceivablesReport;
  appointments: AppointmentsReport;
  utilisation: UtilisationReport;
  packages: PackagesReport;
  patients: PatientsReport;
};
