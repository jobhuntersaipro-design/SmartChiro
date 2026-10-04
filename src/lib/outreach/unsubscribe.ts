import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * One-click unsubscribe for recall / review emails (W4). The link carries an
 * HMAC of the patient id (AUTH_SECRET), so ids can't be guessed or swapped.
 */

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

export function unsubscribeToken(patientId: string): string {
  return createHmac("sha256", secret()).update(`outreach-unsubscribe:${patientId}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribeToken(patientId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(unsubscribeToken(patientId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(patientId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/unsubscribe?p=${encodeURIComponent(patientId)}&t=${unsubscribeToken(patientId)}`;
}

/** Withdraws marketing consent and skips anything still queued. False for a bad link. */
export async function unsubscribePatient(patientId: string, token: string | null | undefined): Promise<boolean> {
  if (!verifyUnsubscribeToken(patientId, token)) return false;
  await prisma.$transaction([
    prisma.patient.updateMany({ where: { id: patientId }, data: { marketingConsent: false, marketingConsentAt: null } }),
    prisma.patientOutreach.updateMany({
      where: { patientId, status: "PENDING" },
      data: { status: "SKIPPED", failureReason: "opted_out" },
    }),
  ]);
  return true;
}
