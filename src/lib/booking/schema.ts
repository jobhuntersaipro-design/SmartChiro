import { z } from "zod";
import type { TreatmentType } from "@prisma/client";
import { TREATMENT_OPTIONS } from "@/lib/treatment-colors";

/** Client-safe request schema for POST /api/public/booking/[slug]/book. */

const PHONE_RE = /^[+()\-\s\d]{7,30}$/;
const IC_RE = /^[A-Za-z0-9-]{5,20}$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const BookingRequestSchema = z.object({
  treatment: z.enum(TREATMENT_OPTIONS as [TreatmentType, ...TreatmentType[]]),
  /** A bookable doctor's id, or "any". */
  doctorId: z.string().trim().min(1).max(64),
  dateTime: z.string().datetime(),
  name: z.string().trim().min(2, "Enter your full name").max(120),
  phone: z
    .string()
    .trim()
    .regex(PHONE_RE, "Enter a valid phone number")
    .refine((v) => {
      const digits = v.replace(/\D/g, "").length;
      return digits >= 9 && digits <= 15;
    }, "Enter a valid phone number"),
  email: z
    .union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email").max(200)])
    .optional()
    .transform((v) => (v ? v : undefined)),
  icNumber: z
    .union([z.literal(""), z.string().trim().regex(IC_RE, "Enter a valid IC or passport number")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  notes: optionalText(500),
  consentData: z.literal(true, { message: "Please agree to the processing of your data" }),
  consentMarketing: z.boolean().optional(),
  /** Honeypot — real browsers leave it empty. */
  website: z.string().optional(),
});

export type BookingRequest = z.infer<typeof BookingRequestSchema>;

/** "Siti Nurhaliza binti Ahmad" → first "Siti", last "Nurhaliza binti Ahmad". */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}
