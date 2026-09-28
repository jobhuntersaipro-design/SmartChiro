import type { TreatmentType } from "@prisma/client";

/** GET /api/public/booking/[slug] — what the public page needs. No staff or patient data. */
export interface PublicBookingConfig {
  slug: string;
  branch: { name: string; address: string | null; phone: string | null; logo: string | null };
  treatments: { value: TreatmentType; label: string; durationMin: number }[];
  doctors: { id: string; name: string; image: string | null }[];
  /** First / last bookable clinic day, "YYYY-MM-DD". */
  firstDay: string;
  lastDay: string;
  note: string | null;
  /** "Malaysia time (GMT+8)". */
  timeZoneLabel: string;
}

/** GET /slots item. */
export interface PublicSlot {
  /** ISO instant. */
  start: string;
  /** Clinic wall-clock label, "9:30 AM". */
  label: string;
}

/** POST /book → 201. */
export interface PublicBookingConfirmation {
  dateTime: string;
  dateLabel: string;
  timeLabel: string;
  duration: number;
  treatment: string;
  doctorName: string;
  firstName: string;
  branch: { name: string; address: string | null; phone: string | null };
  icsUrl: string;
  whatsappUrl: string | null;
}

/** GET/PUT /api/branches/[branchId]/booking. */
export interface BranchBookingSettings {
  enabled: boolean;
  slug: string;
  leadMinutes: number;
  horizonDays: number;
  slotMinutes: number;
  treatments: TreatmentType[];
  /** Empty = every clinician of the branch. */
  doctorIds: string[];
  note: string;
}

export interface BranchBookingSettingsResponse {
  settings: BranchBookingSettings;
  /** Slug proposed from the branch name when none is saved. */
  suggestedSlug: string;
  clinicians: { id: string; name: string }[];
  branchName: string;
  /** False when neither the branch nor any doctor has hours — the page would show no times. */
  hasHours: boolean;
  canEdit: boolean;
}
