import type { ReminderChannel } from "@prisma/client";
import { clinicParts, zoneOffsetMs, CLINIC_TIME_ZONE } from "@/lib/clinic-time";

/**
 * Pure outreach rules (no database): who gets a recall or a review request,
 * on which channel, and when. The materializer and the manual "Send recall"
 * action both go through these so they agree.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Review requests go out only for visits completed within this window. */
export const REVIEW_MAX_AGE_DAYS = 3;

export interface OutreachSettings {
  recallEnabled: boolean;
  recallAfterDays: number;
  recallCooldownDays: number;
  recallDailyLimit: number;
  reviewEnabled: boolean;
  reviewDelayHours: number;
  reviewCooldownDays: number;
  googleReviewUrl: string | null;
}

export const DEFAULT_OUTREACH_SETTINGS: OutreachSettings = {
  recallEnabled: false,
  recallAfterDays: 42,
  recallCooldownDays: 90,
  recallDailyLimit: 30,
  reviewEnabled: false,
  reviewDelayHours: 3,
  reviewCooldownDays: 180,
  googleReviewUrl: null,
};

export type SkipReason =
  | "no_consent"
  | "inactive"
  | "no_contact"
  | "no_visit"
  | "too_recent"
  | "has_booking"
  | "cooldown"
  | "no_review_url"
  | "outside_window"
  | "switched_off"
  | "plan_ended";

export const SKIP_REASON_TEXT: Record<SkipReason, string> = {
  no_consent: "Patient has not agreed to marketing messages",
  inactive: "Patient is not active",
  no_contact: "No phone number or email",
  no_visit: "No completed visit yet",
  too_recent: "Last visit is more recent than the recall interval",
  has_booking: "Patient already has an upcoming appointment",
  cooldown: "Already contacted within the cooldown period",
  no_review_url: "Branch has no Google review link",
  outside_window: "Visit is outside the review window",
  switched_off: "The clinic switched these messages off",
  plan_ended: "The clinic's SmartChiro plan has ended",
};

export interface RecallFacts {
  marketingConsent: boolean;
  status: string | null;
  phone: string | null;
  email: string | null;
  /** Latest completed visit or appointment. */
  lastCompletedAt: Date | null;
  hasUpcoming: boolean;
  /** Latest recall row of any status. */
  lastRecallAt: Date | null;
}

export function isActivePatient(status: string | null): boolean {
  return status === null || status === "active";
}

export function hasContact(p: { phone: string | null; email: string | null }): boolean {
  return Boolean(p.phone?.trim() || p.email?.trim());
}

/** Whether `last` is within `days` of `now`. */
export function withinCooldown(last: Date | null, days: number, now: Date): boolean {
  return last !== null && now.getTime() - last.getTime() < days * DAY_MS;
}

/**
 * Null when the patient should get a recall now, else the first reason not
 * to. `ignoreCooldown` is the OWNER/ADMIN "send anyway" override; `ignoreTiming`
 * lets staff recall someone whose last visit is newer than the interval.
 */
export function recallBlocker(
  f: RecallFacts,
  s: Pick<OutreachSettings, "recallAfterDays" | "recallCooldownDays">,
  now: Date,
  opts: { ignoreCooldown?: boolean; ignoreTiming?: boolean } = {},
): SkipReason | null {
  if (!f.marketingConsent) return "no_consent";
  if (!isActivePatient(f.status)) return "inactive";
  if (!hasContact(f)) return "no_contact";
  if (!opts.ignoreTiming) {
    if (!f.lastCompletedAt) return "no_visit";
    if (now.getTime() - f.lastCompletedAt.getTime() < s.recallAfterDays * DAY_MS) return "too_recent";
    if (f.hasUpcoming) return "has_booking";
  }
  if (!opts.ignoreCooldown && withinCooldown(f.lastRecallAt, s.recallCooldownDays, now)) return "cooldown";
  return null;
}

export interface ReviewFacts {
  marketingConsent: boolean;
  phone: string | null;
  email: string | null;
  /** End of the completed appointment (start + duration). */
  completedAt: Date;
  lastReviewAt: Date | null;
  alreadyRequestedForAppointment: boolean;
}

export function reviewBlocker(
  f: ReviewFacts,
  s: Pick<OutreachSettings, "reviewDelayHours" | "reviewCooldownDays" | "googleReviewUrl">,
  now: Date,
): SkipReason | null {
  if (!s.googleReviewUrl?.trim()) return "no_review_url";
  if (!f.marketingConsent) return "no_consent";
  if (!hasContact(f)) return "no_contact";
  const age = now.getTime() - f.completedAt.getTime();
  if (age < s.reviewDelayHours * HOUR_MS || age > REVIEW_MAX_AGE_DAYS * DAY_MS) return "outside_window";
  if (f.alreadyRequestedForAppointment) return "cooldown";
  if (withinCooldown(f.lastReviewAt, s.reviewCooldownDays, now)) return "cooldown";
  return null;
}

/** Latest of the given dates (nulls ignored). */
export function latestDate(...dates: Array<Date | null | undefined>): Date | null {
  let best: Date | null = null;
  for (const d of dates) if (d && (!best || d > best)) best = d;
  return best;
}

/**
 * WhatsApp when the patient has a phone (unless they prefer email and have
 * one), else email. The dispatcher still falls back to email when WhatsApp
 * can't send.
 */
export function outreachChannel(p: {
  phone: string | null;
  email: string | null;
  reminderChannel: ReminderChannel;
}): "WHATSAPP" | "EMAIL" | null {
  const phone = Boolean(p.phone?.trim());
  const email = Boolean(p.email?.trim());
  if (p.reminderChannel === "EMAIL" && email) return "EMAIL";
  if (phone) return "WHATSAPP";
  if (email) return "EMAIL";
  return null;
}

/** Clinic hours in which automatic outreach may go out (09:00–20:00 local). */
export const SEND_WINDOW = { startHour: 9, endHour: 20 };

/**
 * `now` if it's inside the clinic's daytime send window, else the next 10:00
 * clinic time — the cron runs around the clock, marketing messages shouldn't.
 */
export function nextSendTime(now: Date, timeZone: string = CLINIC_TIME_ZONE): Date {
  const { hour } = clinicParts(now, timeZone);
  if (hour >= SEND_WINDOW.startHour && hour < SEND_WINDOW.endHour) return now;
  const offset = zoneOffsetMs(now, timeZone);
  const local = new Date(now.getTime() + offset);
  const dayShift = hour >= SEND_WINDOW.endHour ? 1 : 0;
  const target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayShift, 10);
  return new Date(target - offset);
}
