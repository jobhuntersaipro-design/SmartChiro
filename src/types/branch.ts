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
