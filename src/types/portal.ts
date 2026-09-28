/** Patient portal API shapes (Phase 7.2). Deliberately free of clinical data. */

export interface PortalBranchContact {
  name: string;
  phone: string | null;
  /** Public online booking page, when the branch has it switched on. */
  bookingUrl: string | null;
}

export interface PortalPatient {
  id: string;
  name: string;
  firstName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  branch: PortalBranchContact & { address: string | null };
}

export interface PortalMe {
  email: string;
  patients: PortalPatient[];
}

export type PortalAppointmentStatus =
  | "SCHEDULED"
  | "CHECKED_IN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export interface PortalAppointment {
  id: string;
  dateTime: string;
  duration: number;
  status: PortalAppointmentStatus;
  treatment: string;
  doctorName: string;
  patientFirstName: string;
  branch: PortalBranchContact;
  canCancel: boolean;
  /** Online cancellation closes this many hours before the start. */
  cancelHours: number;
  cancelBefore: string;
  bookAgainUrl: string | null;
}

export interface PortalPackage {
  id: string;
  name: string;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED" | "CANCELLED";
  sessionsTotal: number;
  sessionsUsed: number;
  sessionsLeft: number;
  purchasedAt: string;
  expiresAt: string | null;
  patientFirstName: string;
  branchName: string;
}

export interface PortalReceipt {
  id: string;
  receiptNumber: string;
  receivedAt: string;
  amount: number;
  method: string;
}

export interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  issuedAt: string;
  dueDate: string | null;
  status: string;
  statusLabel: string;
  total: number;
  paid: number;
  balance: number;
  patientFirstName: string;
  branchName: string;
  receipts: PortalReceipt[];
}
