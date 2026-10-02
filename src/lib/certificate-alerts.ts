import { prisma } from "@/lib/prisma";
import { sendReminderEmail } from "@/lib/email";
import { clinicDateKey } from "@/lib/clinic-time";
import { addDaysToKey } from "@/lib/reports/range";
import { formatDateInput } from "@/lib/date-input";
import { displayDoctorName } from "@/lib/format";
import { daysUntilExpiry, describeExpiry, expiryInstant, expiryKey, shouldSendAlert } from "@/lib/certificates";

/**
 * Daily sweep: email branch owners when a clinician's Annual Practising
 * Certificate reaches 60 / 30 / 7 days before expiry and on expiry — once
 * per threshold (DoctorProfile.apcAlertStage remembers the last one sent;
 * changing the expiry date clears it). Fail-soft: without Resend nothing is
 * sent and nothing is recorded, so the alert goes out once email works.
 */

export interface CertificateAlertEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Returns true when the email was accepted. */
export type CertificateAlertSender = (email: CertificateAlertEmail) => Promise<boolean>;

export interface CertificateSweepResult {
  checked: number;
  alerted: number;
  emails: number;
  skipped?: "email_not_configured";
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const FROM = process.env.RESEND_REMINDERS_FROM || "SmartChiro <noreply@smartchiro.org>";

const defaultSender: CertificateAlertSender = async (email) => {
  const result = await sendReminderEmail({ ...email, from: FROM });
  if (!result.ok) console.error("certificate alert email failed", { to: email.to, reason: result.reason });
  return result.ok;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildCertificateAlertEmail(args: {
  to: string;
  doctorName: string | null;
  doctorId: string;
  apcNumber: string | null;
  expiresOn: string;
  daysLeft: number;
}): CertificateAlertEmail {
  const name = displayDoctorName(args.doctorName);
  const when = describeExpiry(args.daysLeft);
  const date = formatDateInput(args.expiresOn);
  const url = `${APP_URL}/dashboard/doctors/${args.doctorId}?tab=professional`;
  const subject =
    args.daysLeft < 0
      ? `Practising certificate expired: ${name}`
      : `Practising certificate ${args.daysLeft === 0 ? "expires today" : `expires in ${args.daysLeft} days`}: ${name}`;
  const apcLine = args.apcNumber ? ` (APC ${args.apcNumber})` : "";
  const text = `${name}'s Annual Practising Certificate${apcLine} — ${when.toLowerCase()}, on ${date}.\n\nUnder the T&CM Act 2016 a practitioner may not practise without a valid APC. Record the renewed certificate on their profile:\n${url}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px; color: #0b0b0b;">
      <p style="margin: 0 0 16px; font-size: 15px;"><strong>${escapeHtml(name)}</strong>'s Annual Practising Certificate${escapeHtml(apcLine)}:</p>
      <div style="background: #f8f8f8; border: 1px solid #e9e9e9; border-radius: 6px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0; font-size: 17px; font-weight: 600; color: ${args.daysLeft <= 7 ? "#B41A36" : "#A35F00"};">${escapeHtml(when)}</p>
        <p style="margin: 6px 0 0; color: #585858;">Expiry date: ${escapeHtml(date)}</p>
      </div>
      <p style="margin: 0 0 16px; font-size: 14px; color: #585858;">Under the T&amp;CM Act 2016 a practitioner may not practise without a valid APC. Record the renewed certificate on their profile to stop these reminders.</p>
      <p style="margin: 24px 0 0;"><a href="${url}" style="background: #7747ff; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: 500; font-size: 14px;">Open profile</a></p>
      <p style="margin: 32px 0 0; font-size: 12px; color: #7d7d7d;">SmartChiro · Practising certificate alert</p>
    </div>`;
  return { to: args.to, subject, html, text };
}

export async function sweepCertificateAlerts(
  now: Date = new Date(),
  send?: CertificateAlertSender,
): Promise<CertificateSweepResult> {
  if (!send && !process.env.RESEND_API_KEY) return { checked: 0, alerted: 0, emails: 0, skipped: "email_not_configured" };
  const sender = send ?? defaultSender;

  const horizon = expiryInstant(addDaysToKey(clinicDateKey(now), 60));
  const profiles = await prisma.doctorProfile.findMany({
    where: { apcExpiresAt: { not: null, lte: horizon } },
    select: {
      userId: true,
      apcNumber: true,
      apcExpiresAt: true,
      apcAlertStage: true,
      user: { select: { name: true, branchMemberships: { select: { branchId: true } } } },
    },
  });

  const result: CertificateSweepResult = { checked: profiles.length, alerted: 0, emails: 0 };
  for (const p of profiles) {
    if (!p.apcExpiresAt) continue;
    const expiresOn = expiryKey(p.apcExpiresAt);
    const daysLeft = daysUntilExpiry(expiresOn, now);
    const threshold = shouldSendAlert(daysLeft, p.apcAlertStage);
    if (threshold === null) continue;

    // Claim the threshold first so overlapping cron runs can't both send.
    const claimed = await prisma.doctorProfile.updateMany({
      where: { userId: p.userId, apcAlertStage: p.apcAlertStage, apcExpiresAt: p.apcExpiresAt },
      data: { apcAlertStage: threshold },
    });
    if (claimed.count === 0) continue;

    const owners = await prisma.branchMember.findMany({
      where: { role: "OWNER", branchId: { in: p.user.branchMemberships.map((m) => m.branchId) } },
      select: { user: { select: { email: true } } },
    });
    const recipients = [...new Set(owners.map((o) => o.user.email).filter(Boolean))];
    let delivered = 0;
    for (const to of recipients) {
      const ok = await sender(
        buildCertificateAlertEmail({ to, doctorName: p.user.name, doctorId: p.userId, apcNumber: p.apcNumber, expiresOn, daysLeft }),
      ).catch(() => false);
      if (ok) delivered++;
    }
    result.emails += delivered;
    if (recipients.length > 0 && delivered === 0) {
      // Nothing got through: release the claim so the next run retries.
      await prisma.doctorProfile.updateMany({
        where: { userId: p.userId, apcAlertStage: threshold },
        data: { apcAlertStage: p.apcAlertStage },
      });
      continue;
    }
    result.alerted++;
  }
  return result;
}
