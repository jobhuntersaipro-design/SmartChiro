export type AppointmentStatus =
  | "SCHEDULED"
  | "CHECKED_IN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export interface CalendarAppointment {
  id: string;
  dateTime: string; // ISO
  duration: number; // minutes
  status: AppointmentStatus;
  notes: string | null;
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

export interface ConflictItem {
  id: string;
  dateTime: string;
  duration: number;
  patient: { firstName: string; lastName: string };
}
