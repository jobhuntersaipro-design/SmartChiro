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
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  emergencyContact: string | null;
  medicalHistory: string | null;
  notes: string | null;
  doctorId: string;
  doctorName: string;
  branchId: string;
  lastVisit: string | null;
  totalVisits: number;
  totalXrays: number;
  createdAt: string;
  xrays: PatientXray[];
}
