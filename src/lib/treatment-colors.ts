import type { TreatmentType } from "@prisma/client";

export const TREATMENT_LABELS: Record<TreatmentType, string> = {
  INITIAL_CONSULT: "Initial Consult",
  ADJUSTMENT: "Adjustment",
  GONSTEAD: "Gonstead",
  DIVERSIFIED: "Diversified",
  ACTIVATOR: "Activator",
  DROP_TABLE: "Drop Table",
  SOFT_TISSUE: "Soft Tissue",
  SPINAL_DECOMPRESSION: "Spinal Decompression",
  REHAB_EXERCISE: "Rehab Exercise",
  X_RAY: "X-Ray",
  FOLLOW_UP: "Follow-Up",
  WELLNESS_CHECK: "Wellness Check",
  PEDIATRIC: "Pediatric",
  PRENATAL: "Prenatal",
  SPORTS_REHAB: "Sports Rehab",
  OTHER: "Other",
};

export interface TreatmentTokens {
  /** Tinted card background (10-20% opacity) */
  bg: string;
  /** Pill background for the treatment label */
  pillBg: string;
  /** Pill text color */
  pillText: string;
  /** Border / accent color */
  accent: string;
}

/**
 * Per-treatment color palette inspired by Zendenta's chiropractic clinic dashboard.
 * Each treatment has a tinted card background + matching pill so cards group visually
 * by treatment when scanning a doctor's column.
 */
export const TREATMENT_COLORS: Record<TreatmentType, TreatmentTokens> = {
  // Pinks / reds — initial visits & consults
  INITIAL_CONSULT: { bg: "#FDF2F8", pillBg: "#FBCFE8", pillText: "#9D174D", accent: "#EC4899" },
  FOLLOW_UP:       { bg: "#FFF1F2", pillBg: "#FECDD3", pillText: "#9F1239", accent: "#F43F5E" },

  // Greens — core adjustments
  ADJUSTMENT:  { bg: "#F0FDF4", pillBg: "#BBF7D0", pillText: "#166534", accent: "#22C55E" },
  GONSTEAD:    { bg: "#ECFDF5", pillBg: "#A7F3D0", pillText: "#065F46", accent: "#10B981" },
  DIVERSIFIED: { bg: "#F0FDFA", pillBg: "#99F6E4", pillText: "#115E59", accent: "#14B8A6" },

  // Blues — instrument-assisted + decompression
  ACTIVATOR:            { bg: "#EFF6FF", pillBg: "#BFDBFE", pillText: "#1E40AF", accent: "#3B82F6" },
  DROP_TABLE:           { bg: "#F0F9FF", pillBg: "#BAE6FD", pillText: "#075985", accent: "#0EA5E9" },
  SPINAL_DECOMPRESSION: { bg: "#EEF2FF", pillBg: "#C7D2FE", pillText: "#3730A3", accent: "#6366F1" },

  // Purples — soft tissue + rehab
  SOFT_TISSUE:    { bg: "#FAF5FF", pillBg: "#E9D5FF", pillText: "#6B21A8", accent: "#A855F7" },
  REHAB_EXERCISE: { bg: "#F5F3FF", pillBg: "#DDD6FE", pillText: "#5B21B6", accent: "#8B5CF6" },

  // Ambers — imaging + wellness
  X_RAY:          { bg: "#FFFBEB", pillBg: "#FDE68A", pillText: "#92400E", accent: "#F59E0B" },
  WELLNESS_CHECK: { bg: "#FEFCE8", pillBg: "#FEF08A", pillText: "#854D0E", accent: "#EAB308" },

  // Teal / cyan — special populations
  PEDIATRIC:    { bg: "#F0FDFA", pillBg: "#5EEAD4", pillText: "#134E4A", accent: "#14B8A6" },
  PRENATAL:     { bg: "#ECFEFF", pillBg: "#A5F3FC", pillText: "#155E75", accent: "#06B6D4" },
  SPORTS_REHAB: { bg: "#F0FDF4", pillBg: "#86EFAC", pillText: "#14532D", accent: "#16A34A" },

  // Neutral grey for OTHER
  OTHER: { bg: "#F8FAFC", pillBg: "#E2E8F0", pillText: "#334155", accent: "#64748B" },
};

/** Safe accessor — returns OTHER tokens if the type is null/missing. */
export function treatmentTokensFor(type: TreatmentType | null | undefined): TreatmentTokens {
  if (!type) return TREATMENT_COLORS.OTHER;
  return TREATMENT_COLORS[type] ?? TREATMENT_COLORS.OTHER;
}

/** Safe accessor — returns the human label or "Other" if missing. */
export function treatmentLabelFor(type: TreatmentType | null | undefined): string {
  if (!type) return TREATMENT_LABELS.OTHER;
  return TREATMENT_LABELS[type] ?? TREATMENT_LABELS.OTHER;
}

/** Ordered list for selects / forms — by clinical relevance, not alphabetical. */
export const TREATMENT_OPTIONS: TreatmentType[] = [
  "INITIAL_CONSULT",
  "ADJUSTMENT",
  "GONSTEAD",
  "DIVERSIFIED",
  "ACTIVATOR",
  "DROP_TABLE",
  "SOFT_TISSUE",
  "SPINAL_DECOMPRESSION",
  "REHAB_EXERCISE",
  "X_RAY",
  "FOLLOW_UP",
  "WELLNESS_CHECK",
  "PEDIATRIC",
  "PRENATAL",
  "SPORTS_REHAB",
  "OTHER",
];
