import { prisma } from "@/lib/prisma";
import { displayDoctorName } from "@/lib/format";
import { treatmentLabelFor } from "@/lib/treatment-colors";
import { effectiveStatus, sessionsLeft } from "@/lib/packages";
import { PAYMENT_METHOD_LABEL, effectiveInvoiceStatus, fromSen, toSen, type AnyInvoiceStatus } from "@/lib/invoices";
import { INVOICE_STATUS_LABEL } from "@/lib/invoice-detail";
import { logAppointmentEvent } from "@/lib/appointment-audit";
import { reverseRedemption } from "@/lib/package-service";
import { portalCanCancel } from "@/lib/portal/rules";
import type { PortalSession } from "@/lib/portal/auth";
import type {
  PortalAppointment,
  PortalInvoice,
  PortalMe,
  PortalPackage,
} from "@/types/portal";

/**
 * What the patient portal may read and do (Phase 7.2). Every query is scoped
 * to the session's patient ids and uses an explicit `select`: no visits,
 * SOAP notes, medical history, staff notes or X-rays ever leave here.
 */

function bookingUrl(b: { bookingEnabled: boolean; bookingSlug: string | null }): string | null {
  return b.bookingEnabled && b.bookingSlug ? `/book/${b.bookingSlug}` : null;
}

export async function loadPortalMe(session: PortalSession): Promise<PortalMe> {
  const patients = await prisma.patient.findMany({
    where: { id: { in: session.patientIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postcode: true,
      branch: { select: { name: true, phone: true, address: true, bookingEnabled: true, bookingSlug: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return {
    email: session.email,
    patients: patients.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      firstName: p.firstName,
      email: p.email,
      phone: p.phone,
      address: [p.addressLine1, p.addressLine2, [p.postcode, p.city].filter(Boolean).join(" "), p.state]
        .filter((line) => !!line && line.trim())
        .join(", ") || null,
      branch: { name: p.branch.name, phone: p.branch.phone, address: p.branch.address, bookingUrl: bookingUrl(p.branch) },
    })),
  };
}

const APPOINTMENT_SELECT = {
  id: true,
  dateTime: true,
  duration: true,
  status: true,
  treatmentType: true,
  patient: { select: { firstName: true } },
  doctor: { select: { name: true } },
  branch: { select: { name: true, phone: true, portalCancelHours: true, bookingEnabled: true, bookingSlug: true } },
} as const;

type AppointmentRow = {
  id: string;
  dateTime: Date;
  duration: number;
  status: string;
  treatmentType: Parameters<typeof treatmentLabelFor>[0];
  patient: { firstName: string };
  doctor: { name: string | null };
  branch: { name: string; phone: string | null; portalCancelHours: number; bookingEnabled: boolean; bookingSlug: string | null };
};

function serializeAppointment(a: AppointmentRow, now: Date): PortalAppointment {
  const cutoff = new Date(a.dateTime.getTime() - a.branch.portalCancelHours * 60 * 60_000);
  return {
    id: a.id,
    dateTime: a.dateTime.toISOString(),
    duration: a.duration,
    status: a.status as PortalAppointment["status"],
    treatment: a.treatmentType ? treatmentLabelFor(a.treatmentType) : "Appointment",
    doctorName: displayDoctorName(a.doctor.name, "Your chiropractor"),
    patientFirstName: a.patient.firstName,
    branch: { name: a.branch.name, phone: a.branch.phone, bookingUrl: bookingUrl(a.branch) },
    canCancel: portalCanCancel(a, a.branch.portalCancelHours, now),
    cancelHours: a.branch.portalCancelHours,
    cancelBefore: cutoff.toISOString(),
    bookAgainUrl: bookingUrl(a.branch),
  };
}

export async function loadPortalAppointments(
  session: PortalSession,
  now: Date = new Date(),
): Promise<{ upcoming: PortalAppointment[]; past: PortalAppointment[] }> {
  const where = { patientId: { in: session.patientIds } };
  const [upcoming, past] = await Promise.all([
    prisma.appointment.findMany({
      where: { ...where, dateTime: { gte: now } },
      select: APPOINTMENT_SELECT,
      orderBy: { dateTime: "asc" },
      take: 50,
    }),
    prisma.appointment.findMany({
      where: { ...where, dateTime: { lt: now } },
      select: APPOINTMENT_SELECT,
      orderBy: { dateTime: "desc" },
      take: 10,
    }),
  ]);
  return {
    upcoming: upcoming.map((a) => serializeAppointment(a, now)),
    past: past.map((a) => serializeAppointment(a, now)),
  };
}

export async function loadPortalPackages(session: PortalSession, now: Date = new Date()): Promise<PortalPackage[]> {
  const rows = await prisma.patientPackage.findMany({
    where: { patientId: { in: session.patientIds }, status: { not: "CANCELLED" } },
    select: {
      id: true,
      name: true,
      status: true,
      sessionsTotal: true,
      sessionsUsed: true,
      purchasedAt: true,
      expiresAt: true,
      patient: { select: { firstName: true } },
      branch: { select: { name: true } },
    },
    orderBy: { purchasedAt: "desc" },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    status: effectiveStatus(p, now),
    sessionsTotal: p.sessionsTotal,
    sessionsUsed: Math.min(p.sessionsUsed, p.sessionsTotal),
    sessionsLeft: sessionsLeft(p),
    purchasedAt: p.purchasedAt.toISOString(),
    expiresAt: p.expiresAt?.toISOString() ?? null,
    patientFirstName: p.patient.firstName,
    branchName: p.branch.name,
  }));
}

/** Invoices a patient has been given: drafts and cancelled ones stay staff-side. */
export const PORTAL_INVOICE_STATUSES = ["SENT", "PAID", "OVERDUE", "PARTIALLY_PAID"] as const;

export async function loadPortalInvoices(session: PortalSession, now: Date = new Date()): Promise<PortalInvoice[]> {
  const rows = await prisma.invoice.findMany({
    where: { patientId: { in: session.patientIds }, status: { in: [...PORTAL_INVOICE_STATUSES] } },
    select: {
      id: true,
      invoiceNumber: true,
      issuedAt: true,
      dueDate: true,
      status: true,
      amount: true,
      amountPaid: true,
      patient: { select: { firstName: true } },
      branch: { select: { name: true } },
      payments: {
        select: { id: true, amount: true, method: true, receivedAt: true, receiptNumber: true },
        orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { issuedAt: "desc" },
    take: 100,
  });
  return rows.map((inv) => {
    const totalSen = toSen(Number(inv.amount));
    const paidSen = toSen(Number(inv.amountPaid));
    const status = effectiveInvoiceStatus(inv.status as AnyInvoiceStatus, inv.dueDate, now);
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      issuedAt: inv.issuedAt.toISOString(),
      dueDate: inv.dueDate?.toISOString() ?? null,
      status,
      statusLabel: INVOICE_STATUS_LABEL[status],
      total: fromSen(totalSen),
      paid: fromSen(paidSen),
      balance: fromSen(totalSen - paidSen),
      patientFirstName: inv.patient.firstName,
      branchName: inv.branch.name,
      receipts: inv.payments.map((p) => ({
        id: p.id,
        receiptNumber: p.receiptNumber,
        receivedAt: p.receivedAt.toISOString(),
        amount: Number(p.amount),
        method: PAYMENT_METHOD_LABEL[p.method],
      })),
    };
  });
}

/** Whether an invoice belongs to the session and is one the patient was given. */
export function portalMayOpenInvoice(
  session: PortalSession,
  invoice: { patientId: string; status: string } | null,
): boolean {
  if (!invoice) return false;
  return (
    session.patientIds.includes(invoice.patientId) &&
    (PORTAL_INVOICE_STATUSES as readonly string[]).includes(invoice.status)
  );
}

export type PortalCancelResult =
  | { ok: true; appointment: PortalAppointment }
  | { ok: false; status: 404 | 409; error: "not_found" | "not_cancellable" | "too_late"; cancelHours?: number; branchPhone?: string | null };

/**
 * Cancel one of the session's own SCHEDULED appointments before the branch
 * cutoff, with the same side effects as a staff cancel: audit entry (actor
 * "Patient portal"), pending reminders cleared, any package session returned.
 */
export async function cancelPortalAppointment(
  session: PortalSession,
  appointmentId: string,
  reason: string | null,
  now: Date = new Date(),
): Promise<PortalCancelResult> {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, patientId: { in: session.patientIds } },
    select: { ...APPOINTMENT_SELECT, patient: { select: { firstName: true, lastName: true } } },
  });
  if (!appt) return { ok: false, status: 404, error: "not_found" };
  if (appt.status !== "SCHEDULED") return { ok: false, status: 409, error: "not_cancellable" };
  if (!portalCanCancel(appt, appt.branch.portalCancelHours, now)) {
    return {
      ok: false,
      status: 409,
      error: "too_late",
      cancelHours: appt.branch.portalCancelHours,
      branchPhone: appt.branch.phone,
    };
  }

  // Conditional update: a concurrent staff change wins.
  const updated = await prisma.appointment.updateMany({
    where: { id: appt.id, status: "SCHEDULED" },
    data: { status: "CANCELLED" },
  });
  if (updated.count !== 1) return { ok: false, status: 409, error: "not_cancellable" };

  const actor = { id: null, email: session.email, name: "Patient portal" };
  await logAppointmentEvent({
    appointmentId: appt.id,
    action: "CANCEL",
    actor,
    snapshot: { patientName: `${appt.patient.firstName} ${appt.patient.lastName}`, dateTime: appt.dateTime },
    changes: {
      status: { from: "SCHEDULED", to: "CANCELLED" },
      ...(reason ? { cancelReason: { from: null, to: reason } } : {}),
    },
  });
  await prisma.appointmentReminder.deleteMany({ where: { appointmentId: appt.id, status: "PENDING" } });
  await reverseRedemption({ appointmentId: appt.id, actor, now });

  return {
    ok: true,
    appointment: serializeAppointment({ ...appt, status: "CANCELLED" }, now),
  };
}
