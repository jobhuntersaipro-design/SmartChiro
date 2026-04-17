import type { BranchRole } from "@prisma/client";

export interface DaySchedule {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface WorkingSchedule {
  mon?: DaySchedule | null;
  tue?: DaySchedule | null;
  wed?: DaySchedule | null;
  thu?: DaySchedule | null;
  fri?: DaySchedule | null;
  sat?: DaySchedule | null;
  sun?: DaySchedule | null;
}

export interface DoctorProfile {
  licenseNumber: string | null;
  specialties: string[];
  yearsExperience: number | null;
  education: string | null;
  workingSchedule: WorkingSchedule | null;
  treatmentRoom: string | null;
  consultationFee: number | null;
  bio: string | null;
  languages: string[];
  insurancePlans: string[];
  isActive: boolean;
}

export interface DoctorDetail {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  profile: DoctorProfile | null;
  branches: {
    id: string;
    name: string;
    role: BranchRole;
  }[];
  stats: {
    patientCount: number;
    totalVisits: number;
    totalXrays: number;
    visitsThisMonth?: number;
    avgVisitsPerPatient?: number;
  };
}

export interface UpdateDoctorData {
  name?: string;
  phone?: string;
  licenseNumber?: string | null;
  specialties?: string[];
  yearsExperience?: number | null;
  education?: string | null;
  workingSchedule?: WorkingSchedule | null;
  treatmentRoom?: string | null;
  consultationFee?: number | null;
  bio?: string | null;
  languages?: string[];
  insurancePlans?: string[];
  isActive?: boolean;
}

export interface DoctorListItem {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  isActive: boolean;
  specialties: string[];
  branches: {
    id: string;
    name: string;
    role: BranchRole;
    memberId: string;
  }[];
  stats: {
    patientCount: number;
    visitCount: number;
    xrayCount: number;
  };
  createdAt: string;
}

export interface CreateDoctorData {
  name: string;
  email: string;
  password: string;
  branchId: string;
  role?: "DOCTOR" | "ADMIN";
  phone?: string;
  licenseNumber?: string;
  specialties?: string[];
  education?: string;
  yearsExperience?: number;
}
