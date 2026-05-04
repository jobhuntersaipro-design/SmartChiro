export interface PatientXray {
  id: string;
  title: string | null;
  bodyRegion: string | null;
  viewType?: string | null;
  status: 'UPLOADING' | 'READY' | 'ARCHIVED';
  thumbnailUrl?: string | null;
  annotationCount?: number;
  hasNotes?: boolean;
  notePreview?: string | null;
  createdAt: string;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  icNumber: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  occupation: string | null;
  race: string | null;
  maritalStatus: string | null;
  bloodType: string | null;
  allergies: string | null;
  referralSource: string | null;
  // Pricing (MYR)
  initialTreatmentFee: number | null;
  firstTreatmentFee: number | null;
  standardFollowUpFee: number | null;
  // Address
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  // Emergency
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
  // Legacy
  address: string | null;
  emergencyContact: string | null;
  // Clinical
  medicalHistory: string | null;
  notes: string | null;
  status: string;
  // Reminder preferences
  reminderChannel: 'WHATSAPP' | 'EMAIL' | 'BOTH' | 'NONE';
  preferredLanguage: 'en' | 'ms';
  // Relations
  doctorId: string;
  doctorName: string;
  branchId: string;
  // Computed
  lastVisit: string | null;
  totalVisits: number;
  totalXrays: number;
  upcomingAppointment: {
    id: string;
    dateTime: string;
    status: string;
  } | null;
  createdAt: string;
  xrays: PatientXray[];
}

// ─── Past Appointments ───

export type AppointmentStatusValue =
  | 'SCHEDULED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type InvoiceStatusValue =
  | 'DRAFT'
  | 'SENT'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';

export interface PastAppointmentInvoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: InvoiceStatusValue;
}

export interface PastAppointment {
  id: string;
  dateTime: string;
  duration: number;
  status: AppointmentStatusValue;
  isStale: boolean;
  notes: string | null;
  doctor: { id: string; name: string };
  branch: { id: string; name: string };
  visit: { id: string; visitDate: string } | null;
  invoices: PastAppointmentInvoice[];
}

export interface PastAppointmentStats {
  completed: number;
  cancelled: number;
  noShow: number;
  stale: number;
  paid: number;
  outstanding: number;
  currency: 'MYR';
}

export interface PastAppointmentsResponse {
  stats: PastAppointmentStats;
  appointments: PastAppointment[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreatePatientData {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  icNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  occupation?: string;
  race?: string;
  maritalStatus?: string;
  bloodType?: string;
  allergies?: string;
  referralSource?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelation?: string;
  medicalHistory?: string;
  notes?: string;
  doctorId?: string;
  initialTreatmentFee?: number;
  firstTreatmentFee?: number;
  standardFollowUpFee?: number;
  reminderChannel?: 'WHATSAPP' | 'EMAIL' | 'BOTH' | 'NONE';
  preferredLanguage?: 'en' | 'ms';
}
