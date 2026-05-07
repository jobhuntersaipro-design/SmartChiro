export type AppointmentStatus =
  | "SCHEDULED"
  | "CHECKED_IN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export type TreatmentType =
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

export interface CalendarAppointment {
  id: string;
  dateTime: string; // ISO
  duration: number; // minutes
  status: AppointmentStatus;
  notes: string | null;
  treatmentType?: TreatmentType | null;
  /** Whether this appointment has at least one DRAFT/SENT/OVERDUE invoice */
  hasUnpaidInvoice?: boolean;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
  };
  doctor: {
    id: string;
    name: string | null;
    image: string | null;
  };
  branch: {
    id: string;
    name: string;
  };
}

export type AvailabilityKind = "TIME_OFF" | "BREAK_TIME";
export interface AvailabilitySlot {
  doctorId: string;
  kind: AvailabilityKind;
  start: string; // ISO
  end: string; // ISO
  leaveType?: string;
  label?: string;
}

export interface ConflictItem {
  id: string;
  dateTime: string;
  duration: number;
  patient: { firstName: string; lastName: string };
}
