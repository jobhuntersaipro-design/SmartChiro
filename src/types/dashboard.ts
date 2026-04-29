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
