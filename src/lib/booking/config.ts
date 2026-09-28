import type { TreatmentType } from "@prisma/client";
import { TREATMENT_OPTIONS } from "@/lib/treatment-colors";

/** Client-safe online booking settings helpers. */

/** Offered when the branch hasn't picked treatments yet. */
export const DEFAULT_BOOKING_TREATMENTS: TreatmentType[] = ["INITIAL_CONSULT", "ADJUSTMENT", "FOLLOW_UP"];

export const BOOKING_LIMITS = {
  leadMinutes: { min: 0, max: 7 * 24 * 60 },
  horizonDays: { min: 1, max: 180 },
  slotMinutes: [5, 10, 15, 20, 30, 45, 60] as const,
  noteMax: 500,
} as const;

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

/** Lowercase letters, digits and single hyphens, 3–40 characters, no leading/trailing hyphen. */
export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !slug.includes("--");
}

/** "SmartChiro KLCC" → "smartchiro-klcc". Always 3–40 valid characters. */
export function suggestSlug(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  if (base.length >= 3) return base;
  return `${base || "clinic"}-book`.slice(0, 40);
}

/** Treatments the page offers, in the standard order. */
export function effectiveTreatments(stored: TreatmentType[] | null | undefined): TreatmentType[] {
  const chosen = stored && stored.length > 0 ? new Set(stored) : new Set(DEFAULT_BOOKING_TREATMENTS);
  return TREATMENT_OPTIONS.filter((t) => chosen.has(t));
}

/** Public booking URL for a slug. */
export function bookingUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/book/${slug}`;
}

/** wa.me share link (no recipient) with a message and the booking URL. */
export function whatsAppShareUrl(branchName: string, url: string): string {
  const text = `Book your appointment at ${branchName} online: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
