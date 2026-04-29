export interface PatientXray {
  id: string;
  title: string | null;
  bodyRegion: string | null;
  viewType: string | null;
  status: string;
  thumbnailUrl: string | null;
  annotationCount: number;
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
  createdAt: string;
  xrays: PatientXray[];
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
