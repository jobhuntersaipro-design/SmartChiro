import { NextResponse } from "next/server";
import type { TreatmentType } from "@prisma/client";
import { CLINIC_TIME_ZONE, clinicUtcOffsetLabel } from "@/lib/clinic-time";
import { defaultDurationFor, treatmentLabelFor } from "@/lib/treatment-colors";
import { effectiveTreatments } from "@/lib/booking/config";
import {
  findBookableBranch,
  loadBookableDoctors,
  windowFor,
  type BookableDoctor,
  type BookingBranch,
} from "@/lib/booking/availability";
import { BOOKING_LIMITS_PER_IP, clientIp, retryAfterSeconds, takeToken, type BucketConfig } from "@/lib/booking/rate-limit";
import type { PublicBookingConfig } from "@/types/booking";

/** Server helpers shared by the public booking routes and page. */

/** "Malaysia time (GMT+8)". */
export function timeZoneLabel(now: Date = new Date()): string {
  const offset = clinicUtcOffsetLabel(now); // "+08:00"
  const [h, m] = offset.slice(1).split(":");
  const gmt = `GMT${offset[0]}${Number(h)}${m === "00" ? "" : `:${m}`}`;
  const zone = CLINIC_TIME_ZONE === "Asia/Kuala_Lumpur" ? "Malaysia time" : "Clinic time";
  return `${zone} (${gmt})`;
}

export async function publicConfig(branch: BookingBranch, now: Date = new Date()): Promise<PublicBookingConfig> {
  const doctors = await loadBookableDoctors(branch);
  const window = windowFor(branch, now);
  const address = [branch.address, branch.city, branch.state].filter(Boolean).join(", ") || null;
  return {
    slug: branch.bookingSlug ?? "",
    branch: { name: branch.name, address, phone: branch.phone, logo: branch.logo },
    treatments: effectiveTreatments(branch.bookingTreatments).map((t: TreatmentType) => ({
      value: t,
      label: treatmentLabelFor(t),
      durationMin: defaultDurationFor(t),
    })),
    doctors: doctors.map((d) => ({ id: d.id, name: d.name, image: d.image })),
    firstDay: window.first,
    lastDay: window.last,
    note: branch.bookingNote,
    timeZoneLabel: timeZoneLabel(now),
  };
}

export interface SlotQuery {
  treatment: TreatmentType;
  doctorId: string | "any";
  /** The doctor asked for, or every bookable doctor for "any". */
  candidates: BookableDoctor[];
}

/** Validate `treatment` and `doctorId` (id or "any") against the branch settings. */
export async function parseSlotQuery(branch: BookingBranch, url: URL): Promise<SlotQuery | { response: Response }> {
  const treatment = url.searchParams.get("treatment") as TreatmentType | null;
  if (!treatment || !effectiveTreatments(branch.bookingTreatments).includes(treatment)) {
    return { response: NextResponse.json({ error: "treatment_not_offered" }, { status: 422 }) };
  }
  const doctorId = url.searchParams.get("doctorId") || "any";
  const doctors = await loadBookableDoctors(branch);
  const candidates = doctorId === "any" ? doctors : doctors.filter((d) => d.id === doctorId);
  if (candidates.length === 0) {
    return { response: NextResponse.json({ error: "doctor_not_bookable" }, { status: 422 }) };
  }
  return { treatment, doctorId, candidates };
}

export function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export function tooManyRequests(config: BucketConfig) {
  return NextResponse.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds(config)) } },
  );
}

/** Rate-limit, then resolve an enabled branch. Returns a Response on failure. */
export async function guardPublic(
  req: Request,
  slug: string,
  bucket: keyof typeof BOOKING_LIMITS_PER_IP = "read",
): Promise<{ branch: BookingBranch } | { response: Response }> {
  const config = BOOKING_LIMITS_PER_IP[bucket];
  if (!takeToken(`${bucket}:${clientIp(req)}`, config)) return { response: tooManyRequests(config) };
  const branch = await findBookableBranch(slug);
  if (!branch) return { response: notFound() };
  return { branch };
}
