import { clinicDateKey } from "@/lib/clinic-time";
import { isIsoDate } from "@/lib/date-input";
import { keyToDayNumber } from "@/lib/reports/range";

/**
 * Practising certificates (T&CM Act 2016): the T&CM registration number and
 * the Annual Practising Certificate (APC) with its expiry date. Pure and
 * client-safe.
 *
 * The expiry is a calendar date. It is stored at 00:00 UTC and compared with
 * today's *clinic* date, so a certificate expiring 31/12 is valid all of
 * 31/12 in Malaysia and shows as expired from 01/01.
 */

/** Alert thresholds, in days before expiry (0 = on or after the expiry date). */
export const APC_ALERT_THRESHOLDS = [60, 30, 7, 0] as const;
export type ApcAlertThreshold = (typeof APC_ALERT_THRESHOLDS)[number];

/** Display stage: expired, due within 7 / 30 / 60 days, or fine. */
export type CertificateStage = "expired" | "d7" | "d30" | "d60" | "ok";

export const CERTIFICATE_FIELD_MAX = 50;

/** "YYYY-MM-DD" of a stored expiry (00:00 UTC). */
export function expiryKey(expiresAt: Date | string): string {
  return (typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt).toISOString().slice(0, 10);
}

/** The stored instant for a "YYYY-MM-DD" expiry date. */
export function expiryInstant(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** Whole clinic days from today until the expiry date (0 = expires today, negative = expired). */
export function daysUntilExpiry(expiresOn: string, now: Date = new Date()): number {
  const expiry = keyToDayNumber(expiresOn);
  const today = keyToDayNumber(clinicDateKey(now));
  if (expiry === null || today === null) throw new Error(`Invalid date: ${expiresOn}`);
  return expiry - today;
}

export function stageForDays(daysLeft: number): CertificateStage {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 7) return "d7";
  if (daysLeft <= 30) return "d30";
  if (daysLeft <= 60) return "d60";
  return "ok";
}

export function certificateStage(expiresOn: string, now: Date = new Date()): CertificateStage {
  return stageForDays(daysUntilExpiry(expiresOn, now));
}

/**
 * The alert threshold a certificate has reached, or null when it's more than
 * 60 days away. The expiry day itself already counts as the "on expiry" alert.
 */
export function alertThresholdForDays(daysLeft: number): ApcAlertThreshold | null {
  if (daysLeft <= 0) return 0;
  if (daysLeft <= 7) return 7;
  if (daysLeft <= 30) return 30;
  if (daysLeft <= 60) return 60;
  return null;
}

/**
 * Whether the cron should email now: a threshold has been reached that is
 * tighter than the last one sent. Skipped thresholds (e.g. expiry entered 5
 * days out) send once, for the current threshold only.
 */
export function shouldSendAlert(daysLeft: number, lastSent: number | null): ApcAlertThreshold | null {
  const threshold = alertThresholdForDays(daysLeft);
  if (threshold === null) return null;
  if (lastSent !== null && lastSent <= threshold) return null;
  return threshold;
}

/** "Expired 3 days ago" / "Expires today" / "Expires in 20 days". */
export function describeExpiry(daysLeft: number): string {
  if (daysLeft < 0) {
    const n = -daysLeft;
    return `Expired ${n} day${n === 1 ? "" : "s"} ago`;
  }
  if (daysLeft === 0) return "Expires today";
  return `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
}

export const STAGE_LABEL: Record<CertificateStage, string> = {
  expired: "APC expired",
  d7: "APC due ≤ 7 days",
  d30: "APC due ≤ 30 days",
  d60: "APC due ≤ 60 days",
  ok: "APC valid",
};

/** Pill colours: red once expired or within a week, amber within 30, blue within 60. */
export const STAGE_TONE: Record<CertificateStage, string> = {
  expired: "bg-[#FDECEF] text-[#B41A36] border-[#F5C2CC]",
  d7: "bg-[#FDECEF] text-[#B41A36] border-[#F5C2CC]",
  d30: "bg-[#FEF5E7] text-[#A35F00] border-[#F8DDB0]",
  d60: "bg-[#EAF3FD] text-[#0558B0] border-[#C4DDF7]",
  ok: "bg-[#E9F7EF] text-[#108C3D] border-[#BFE8CF]",
};

// ─── Profile input (PUT /api/doctors/[userId]) ───

export interface CertificateUpdate {
  tcmRegistrationNo?: string | null;
  apcNumber?: string | null;
  apcExpiresAt?: Date | null;
}

export type CertificateParseResult = { ok: true; data: CertificateUpdate } | { ok: false; error: string };

function parseText(value: unknown, label: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${label} must be text` };
  const text = value.trim();
  if (text.length > CERTIFICATE_FIELD_MAX) return { ok: false, error: `${label} must be max ${CERTIFICATE_FIELD_MAX} characters` };
  return { ok: true, value: text || null };
}

/**
 * Validates the certificate fields of a profile update. Omitted fields stay
 * untouched; "" or null clears one. The expiry is "YYYY-MM-DD".
 */
export function parseCertificateInput(body: Record<string, unknown>): CertificateParseResult {
  const data: CertificateUpdate = {};
  for (const [key, label] of [
    ["tcmRegistrationNo", "T&CM registration number"],
    ["apcNumber", "APC number"],
  ] as const) {
    if (body[key] === undefined) continue;
    const parsed = parseText(body[key], label);
    if (!parsed.ok) return parsed;
    data[key] = parsed.value;
  }
  if (body.apcExpiresAt !== undefined) {
    const raw = body.apcExpiresAt;
    if (raw === null || raw === "") data.apcExpiresAt = null;
    else if (typeof raw === "string" && isIsoDate(raw)) data.apcExpiresAt = expiryInstant(raw);
    else return { ok: false, error: "APC expiry must be a date (YYYY-MM-DD)" };
  }
  return { ok: true, data };
}

/** True when the update changes the stored expiry (which re-arms the alerts). */
export function expiryChanged(current: Date | null | undefined, next: Date | null | undefined): boolean {
  if (next === undefined) return false;
  const a = current ? current.getTime() : null;
  const b = next ? next.getTime() : null;
  return a !== b;
}
