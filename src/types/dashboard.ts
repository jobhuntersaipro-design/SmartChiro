import type { BranchRole } from "@prisma/client";

export interface DashboardUser {
  id: string;
  name: string | null;
  branchRole: BranchRole | null;
  activeBranchId: string | null;
}

export interface BranchSummary {
  id: string;
  name: string;
  address: string | null;
  doctorCount: number;
  patientCount: number;
  todayAppointments: number;
  doctors: { id: string; name: string | null; image: string | null }[];
}

export interface OwnerStats {
  totalPatients: number;
  todayAppointments: number;
  completedAppointments: number;
  remainingAppointments: number;
  xraysThisWeek: number;
  xraysLastWeek: number;
  activeDoctors: number;
  totalBranches: number;
}

/** Owner/admin "what needs attention" numbers — GET /api/dashboard/signals. */
export interface OwnerSignals {
  /** Sum of invoices marked PAID today (clinic day), in MYR. */
  revenueToday: number;
  paymentsToday: number;
  noShowsToday: number;
  /** Past appointments still SCHEDULED — never checked in, completed or marked no-show. */
  staleAppointments: number;
  /** Active patients whose last visit was 30+ days ago and who have nothing booked. */
  recallDue: number;
  recallSample: { id: string; name: string; lastVisit: string; marketingConsent?: boolean }[];
}

export interface DoctorStats {
  myPatients: number;
  todayAppointments: number;
  remainingAppointments: number;
  xraysThisMonth: number;
  xraysLastMonth: number;
  pendingAnnotations: number;
}

export interface RecentPatient {
  id: string;
  firstName: string;
  lastName: string;
  lastVisitDate: string | null;
  xrayCount: number;
}

export interface RecentXray {
  id: string;
  patientId: string;
  title: string | null;
  fileUrl: string;
  patientName: string;
  createdAt: string;
}
