import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { sendDoctorBookingNotification } from "@/lib/email";
import { clinicDateLabel, clinicTimeLabel } from "@/lib/clinic-time";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface OnlineBookingNotice {
  appointmentId: string;
  branchId: string;
  branchName: string;
  doctor: { id: string; name: string | null; email: string | null };
  patientName: string;
  patientPhone: string;
  dateTime: Date;
  duration: number;
  treatmentLabel: string;
  isNewPatient: boolean;
}

async function sendManagerEmail(to: string, n: OnlineBookingNotice, doctorLabel: string): Promise<void> {
  const when = `${clinicDateLabel(n.dateTime, "day")}, ${clinicTimeLabel(n.dateTime)}`;
  const url = `${APP_URL}/dashboard/appointments?appointment=${n.appointmentId}`;
  const patientLine = `${n.patientName} (${n.patientPhone})${n.isNewPatient ? " — new patient" : ""}`;
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: "SmartChiro <noreply@smartchiro.org>",
    to,
    subject: `Online booking: ${n.patientName} — ${when}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px; color: #0b0b0b;">
        <p style="margin: 0 0 16px; font-size: 15px;">A patient booked online at ${escapeHtml(n.branchName)}.</p>
        <div style="background: #f8f8f8; border: 1px solid #e9e9e9; border-radius: 6px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px; font-size: 17px; font-weight: 600;">${escapeHtml(patientLine)}</p>
          <p style="margin: 6px 0; color: #585858;"><strong>When:</strong> ${escapeHtml(when)} (${n.duration} min)</p>
          <p style="margin: 6px 0; color: #585858;"><strong>Treatment:</strong> ${escapeHtml(n.treatmentLabel)}</p>
          <p style="margin: 6px 0; color: #585858;"><strong>Doctor:</strong> ${escapeHtml(doctorLabel)}</p>
        </div>
        <p style="margin: 24px 0 0;">
          <a href="${url}" style="background: #7747ff; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: 500; font-size: 14px;">View appointment</a>
        </p>
        <p style="margin: 32px 0 0; font-size: 12px; color: #7d7d7d;">SmartChiro · Online booking notification</p>
      </div>
    `,
    text: `A patient booked online at ${n.branchName}.\n\nPatient: ${patientLine}\nWhen: ${when} (${n.duration} min)\nTreatment: ${n.treatmentLabel}\nDoctor: ${doctorLabel}\n\nView: ${url}`,
  });
}

/**
 * The booked doctor gets the standard booking email; branch owners and admins
 * (other than that doctor) get an online-booking notice. Fail-soft and skipped
 * without RESEND_API_KEY.
 */
export async function notifyOnlineBooking(n: OnlineBookingNotice): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  const doctorLabel = n.doctor.name ?? "Doctor";
  const jobs: Promise<void>[] = [];
  if (n.doctor.email) {
    jobs.push(
      sendDoctorBookingNotification({
        to: n.doctor.email,
        doctorName: n.doctor.name,
        patientName: n.patientName,
        dateTime: n.dateTime,
        duration: n.duration,
        branchName: n.branchName,
        treatmentLabel: n.treatmentLabel,
        bookedByName: "Online booking",
        appointmentUrl: `${APP_URL}/dashboard/appointments?appointment=${n.appointmentId}`,
      }),
    );
  }
  try {
    const managers = await prisma.branchMember.findMany({
      where: { branchId: n.branchId, role: { in: ["OWNER", "ADMIN"] }, userId: { not: n.doctor.id } },
      select: { user: { select: { email: true } } },
    });
    for (const m of managers) {
      if (!m.user.email) continue;
      jobs.push(
        sendManagerEmail(m.user.email, n, doctorLabel).catch((e) =>
          console.error("online booking manager email failed", { to: m.user.email, error: e }),
        ),
      );
    }
  } catch (e) {
    console.error("online booking manager lookup failed", e);
  }
  await Promise.allSettled(jobs);
}
