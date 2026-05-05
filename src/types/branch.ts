export interface CreateBranchData {
  // Required
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;

  // Common (ownerName auto-set from session — not user-editable)
  operatingHours: string; // JSON string of DayHours map
  treatmentRooms: number | null;

  // Nice-to-have
  website: string;
  billingContactName: string;
  billingContactEmail: string;
  billingContactPhone: string;
}

export interface DayHours {
  open: string; // "09:00"
  close: string; // "18:00"
}

export type OperatingHoursMap = Partial<Record<
  "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
  DayHours
>>;

export interface BranchWithStats {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  operatingHours: string | null;
  treatmentRooms: number | null;
  clinicType: string | null;
  billingContactName: string | null;
  billingContactEmail: string | null;
  billingContactPhone: string | null;
  doctorCount: number;
  patientCount: number;
  todayAppointments: number;
  weekAppointments: number;
  doctors: { id: string; name: string | null; image: string | null }[];
  userRole: string;
  createdAt: string;
}

export interface BranchDetail {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  operatingHours: string | null;
  treatmentRooms: number | null;
  clinicType: string | null;
  ownerName: string | null;
  licenseNumber: string | null;
  specialties: string | null;
  insuranceProviders: string | null;
  billingContactName: string | null;
  billingContactEmail: string | null;
  billingContactPhone: string | null;
  members: BranchMemberDetail[];
  userRole: string;
  patientCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BranchMemberDetail {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  joinedAt: string;
  patientCount?: number;
  xrayCountThisMonth?: number;
}

export interface BranchStats {
  doctorCount: number;
  patientCount: number;
  todayAppointments: number;
  weekAppointments: number;
  completedToday: number;
  xraysThisMonth: number;
}

export interface ScheduleAppointment {
  id: string;
  dateTime: string;
  duration: number;
  status: string;
  patient: { id: string; firstName: string; lastName: string } | null;
  doctor: { id: string; name: string | null } | null;
  notes: string | null;
}

export interface ScheduleDoctor {
  id: string;
  name: string | null;
  image: string | null;
  color: string;
}

export interface BranchPatient {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  doctor: { id: string; name: string | null } | null;
  lastVisitDate: string | null;
  xrayCount: number;
  visitCount: number;
}

export type BranchAuditAction = "CREATE" | "UPDATE" | "DELETE";

export type BranchAuditChanges =
  | { after: Record<string, unknown> }
  | { before: Record<string, unknown>; after: Record<string, unknown> }
  | { before: Record<string, unknown> };

export interface BranchAuditEntry {
  id: string;
  action: BranchAuditAction;
  actorId: string | null;
  actorEmail: string;
  actorName: string | null;
  branchNameAtEvent: string;
  changes: BranchAuditChanges;
  createdAt: string;
}
