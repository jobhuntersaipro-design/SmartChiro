import { z } from "zod";
import { TreatmentType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAppointmentEvent, type ActorContext } from "@/lib/appointment-audit";
import { createInvoice } from "@/lib/invoices";
import { effectiveStatus, expiryFor, ineligibilityReason, pickPackageForAppointment, sessionsLeft, unitValue } from "@/lib/packages";
import type {
  PackageRedemptionJson,
  PackageTemplateJson,
  PatientPackageJson,
  RedemptionSummaryJson,
  TreatmentTypeValue,
} from "@/types/packages";

/**
 * Database side of prepaid packages (Phase 3): selling, redeeming a session
 * for an appointment, reversing it, and the expiry sweep.
 *
 * Redemptions: reversed rows are kept as history, so `appointmentId` is not
 * unique in the table. "At most one non-reversed redemption per appointment"
 * and `sessionsUsed` consistency are enforced here by locking the appointment
 * row, then the package row (always in that order), inside one transaction.
 */

type Tx = Prisma.TransactionClient;

const money = (d: Prisma.Decimal | number): number => Math.round(Number(d.toString()) * 100) / 100;

/** Round MYR to sen. */
export const roundMoney = (n: number): number => Math.round(n * 100) / 100;

const TreatmentTypesSchema = z.array(z.enum(TreatmentType)).max(16);

/** Body of POST /api/branches/[branchId]/packages (all optional on PATCH). */
export const PackageTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  sessions: z.number().int().min(1).max(500),
  price: z.number().nonnegative().max(1_000_000),
  validityDays: z.number().int().min(1).max(3650).nullable().optional(),
  treatmentTypes: TreatmentTypesSchema.optional(),
  isActive: z.boolean().optional(),
});

/** Body of POST /api/patients/[patientId]/packages: a catalogue template or a custom package. */
export const SellPackageSchema = z.union([
  z.object({ templateId: z.string().min(1), notes: z.string().trim().max(1000).optional() }).strict(),
  z
    .object({
      name: z.string().trim().min(1).max(120),
      sessions: z.number().int().min(1).max(500),
      price: z.number().nonnegative().max(1_000_000),
      validityDays: z.number().int().min(1).max(3650).nullable().optional(),
      treatmentTypes: TreatmentTypesSchema.optional(),
      notes: z.string().trim().max(1000).optional(),
    })
    .strict(),
]);

// ─── Serialisation ───

type TemplateRow = Prisma.PackageTemplateGetPayload<object>;

export function serializeTemplate(t: TemplateRow): PackageTemplateJson {
  return {
    id: t.id,
    branchId: t.branchId,
    name: t.name,
    description: t.description,
    sessions: t.sessions,
    price: money(t.price),
    unitValue: unitValue({ price: t.price, sessionsTotal: t.sessions }),
    validityDays: t.validityDays,
    treatmentTypes: t.treatmentTypes as TreatmentTypeValue[],
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export const PATIENT_PACKAGE_INCLUDE = {
  invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true } },
  redemptions: {
    orderBy: { redeemedAt: "desc" },
    select: {
      id: true,
      appointmentId: true,
      redeemedAt: true,
      redeemedById: true,
      reversedAt: true,
      reversedById: true,
      appointment: {
        select: { dateTime: true, status: true, treatmentType: true, doctor: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.PatientPackageInclude;

type PatientPackageRow = Prisma.PatientPackageGetPayload<{ include: typeof PATIENT_PACKAGE_INCLUDE }>;

/** Names for the user ids a set of packages mentions (sold by / redeemed by / reversed by). */
export async function userNamesFor(rows: PatientPackageRow[]): Promise<Map<string, string | null>> {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.soldById) ids.add(r.soldById);
    for (const x of r.redemptions) {
      if (x.redeemedById) ids.add(x.redeemedById);
      if (x.reversedById) ids.add(x.reversedById);
    }
  }
  if (ids.size === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

function userRef(id: string | null, names: Map<string, string | null>) {
  return id ? { id, name: names.get(id) ?? null } : null;
}

function serializeRedemption(x: PatientPackageRow["redemptions"][number], names: Map<string, string | null>): PackageRedemptionJson {
  return {
    id: x.id,
    appointmentId: x.appointmentId,
    appointment: x.appointment
      ? {
          dateTime: x.appointment.dateTime.toISOString(),
          status: x.appointment.status,
          treatmentType: x.appointment.treatmentType as TreatmentTypeValue | null,
          doctorName: x.appointment.doctor?.name ?? null,
        }
      : null,
    redeemedAt: x.redeemedAt.toISOString(),
    redeemedBy: userRef(x.redeemedById, names),
    reversedAt: x.reversedAt?.toISOString() ?? null,
    reversedBy: userRef(x.reversedById, names),
  };
}

export function serializePatientPackage(
  p: PatientPackageRow,
  names: Map<string, string | null>,
  now: Date = new Date(),
): PatientPackageJson {
  return {
    id: p.id,
    patientId: p.patientId,
    branchId: p.branchId,
    templateId: p.templateId,
    name: p.name,
    sessionsTotal: p.sessionsTotal,
    sessionsUsed: p.sessionsUsed,
    sessionsLeft: sessionsLeft(p),
    price: money(p.price),
    unitValue: unitValue(p),
    treatmentTypes: p.treatmentTypes as TreatmentTypeValue[],
    purchasedAt: p.purchasedAt.toISOString(),
    expiresAt: p.expiresAt?.toISOString() ?? null,
    status: p.status,
    effectiveStatus: effectiveStatus(p, now),
    soldBy: userRef(p.soldById, names),
    invoice: p.invoice
      ? { id: p.invoice.id, invoiceNumber: p.invoice.invoiceNumber, status: p.invoice.status, amount: money(p.invoice.amount) }
      : null,
    notes: p.notes,
    cancelledAt: p.cancelledAt?.toISOString() ?? null,
    cancelReason: p.cancelReason,
    redemptions: p.redemptions.map((x) => serializeRedemption(x, names)),
    createdAt: p.createdAt.toISOString(),
  };
}

// ─── Selling ───

export interface SellPackageInput {
  patientId: string;
  branchId: string;
  soldById: string;
  templateId: string | null;
  name: string;
  sessions: number;
  price: number;
  validityDays: number | null;
  treatmentTypes: TreatmentType[];
  notes?: string | null;
  now?: Date;
}

/** Creates the patient package and its sale invoice (SENT, one line: the package). */
export async function sellPackage(tx: Tx, input: SellPackageInput) {
  const now = input.now ?? new Date();
  const due = new Date(now.getTime() + 14 * 86_400_000);
  // Shared invoice creation: per-branch number, and SST when the branch
  // charges it and the patient isn't Malaysian.
  const invoice = await createInvoice(tx, {
    branchId: input.branchId,
    patientId: input.patientId,
    status: "SENT",
    dueDate: due,
    issuedAt: now,
    lines: [
      {
        description: `Package: ${input.name} (${input.sessions} sessions)`,
        quantity: 1,
        unitPrice: input.price,
      },
    ],
  });
  return tx.patientPackage.create({
    data: {
      patientId: input.patientId,
      branchId: input.branchId,
      templateId: input.templateId,
      name: input.name,
      sessionsTotal: input.sessions,
      price: input.price,
      treatmentTypes: input.treatmentTypes,
      purchasedAt: now,
      expiresAt: expiryFor(now, input.validityDays),
      soldById: input.soldById,
      invoiceId: invoice.id,
      notes: input.notes ?? null,
    },
    include: PATIENT_PACKAGE_INCLUDE,
  });
}

export type SaleSource = Pick<
  SellPackageInput,
  "templateId" | "name" | "sessions" | "price" | "validityDays" | "treatmentTypes" | "notes"
>;

/** Snapshot of what is being sold — an active template of the branch, or the custom fields. */
export async function resolveSaleSource(
  body: z.infer<typeof SellPackageSchema>,
  branchId: string,
): Promise<SaleSource | null> {
  if ("templateId" in body) {
    const t = await prisma.packageTemplate.findUnique({ where: { id: body.templateId } });
    if (!t || t.branchId !== branchId || !t.isActive) return null;
    return {
      templateId: t.id,
      name: t.name,
      sessions: t.sessions,
      price: Number(t.price.toString()),
      validityDays: t.validityDays,
      treatmentTypes: t.treatmentTypes,
      notes: body.notes ?? null,
    };
  }
  return {
    templateId: null,
    name: body.name,
    sessions: body.sessions,
    price: roundMoney(body.price),
    validityDays: body.validityDays ?? null,
    treatmentTypes: [...new Set(body.treatmentTypes ?? [])],
    notes: body.notes ?? null,
  };
}

// ─── Redemption ───

export type RedeemError =
  | "appointment_not_found"
  | "appointment_cancelled"
  | "appointment_invoiced"
  | "already_redeemed"
  | "no_package"
  | "package_not_found"
  | "package_not_eligible";

/** HTTP status + user-facing message per redeem error. */
export const REDEEM_ERROR_STATUS: Record<RedeemError, { status: number; message: string }> = {
  appointment_not_found: { status: 404, message: "Appointment not found." },
  appointment_cancelled: { status: 422, message: "A cancelled appointment can't use a package session." },
  appointment_invoiced: { status: 409, message: "This appointment already has an invoice." },
  already_redeemed: { status: 409, message: "A package session is already used for this appointment." },
  no_package: { status: 409, message: "The patient has no active package that covers this appointment." },
  package_not_found: { status: 404, message: "Package not found for this patient." },
  package_not_eligible: { status: 422, message: "That package can't be used for this appointment." },
};

export type RedeemResult =
  | { ok: true; redemption: RedemptionSummaryJson }
  | { ok: false; error: RedeemError; reason?: string };

class RedeemAbort extends Error {
  constructor(public readonly result: Extract<RedeemResult, { ok: false }>) {
    super(result.error);
  }
}

async function lockAppointment(tx: Tx, appointmentId: string) {
  await tx.$queryRaw`SELECT id FROM "Appointment" WHERE id = ${appointmentId} FOR UPDATE`;
  return tx.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      patientId: true,
      dateTime: true,
      status: true,
      treatmentType: true,
      series: { select: { patientPackageId: true } },
      patient: { select: { firstName: true, lastName: true } },
      invoices: { where: { status: { not: "CANCELLED" } }, select: { id: true }, take: 1 },
      redemptions: { where: { reversedAt: null }, select: { id: true }, take: 1 },
    },
  });
}

async function lockActivePackages(tx: Tx, patientId: string) {
  await tx.$queryRaw`SELECT id FROM "PatientPackage" WHERE "patientId" = ${patientId} AND status = 'ACTIVE' ORDER BY id FOR UPDATE`;
  return tx.patientPackage.findMany({ where: { patientId, status: "ACTIVE" }, orderBy: { purchasedAt: "asc" } });
}

function toSummary(
  redemption: { id: string; appointmentId: string; redeemedAt: Date },
  pkg: { id: string; name: string; sessionsUsed: number; sessionsTotal: number },
): RedemptionSummaryJson {
  return {
    id: redemption.id,
    appointmentId: redemption.appointmentId,
    patientPackageId: pkg.id,
    packageName: pkg.name,
    sessionsUsed: pkg.sessionsUsed,
    sessionsTotal: pkg.sessionsTotal,
    sessionsLeft: Math.max(0, pkg.sessionsTotal - pkg.sessionsUsed),
    redeemedAt: redemption.redeemedAt.toISOString(),
  };
}

/**
 * Use one session of a package for an appointment. With no `patientPackageId`
 * the earliest-expiring eligible package is picked (the series' package first).
 * Appointments that already carry a non-cancelled invoice are not redeemed.
 */
export async function redeemAppointment(args: {
  appointmentId: string;
  patientPackageId?: string | null;
  actor: ActorContext | null;
}): Promise<RedeemResult> {
  try {
    const { summary, snapshot } = await prisma.$transaction(async (tx) => {
      const appt = await lockAppointment(tx, args.appointmentId);
      if (!appt) throw new RedeemAbort({ ok: false, error: "appointment_not_found" });
      if (appt.status === "CANCELLED") throw new RedeemAbort({ ok: false, error: "appointment_cancelled" });
      if (appt.redemptions.length > 0) throw new RedeemAbort({ ok: false, error: "already_redeemed" });
      if (appt.invoices.length > 0) throw new RedeemAbort({ ok: false, error: "appointment_invoiced" });
      const packages = await lockActivePackages(tx, appt.patientId);
      const pkg = choosePackage(packages, appt, args.patientPackageId);
      const updated = await tx.patientPackage.update({
        where: { id: pkg.id },
        data: {
          sessionsUsed: { increment: 1 },
          ...(pkg.sessionsUsed + 1 >= pkg.sessionsTotal ? { status: "COMPLETED" as const } : {}),
        },
      });
      const redemption = await tx.packageRedemption.create({
        data: { patientPackageId: pkg.id, appointmentId: appt.id, redeemedById: args.actor?.id ?? null },
      });
      return { summary: toSummary(redemption, updated), snapshot: snapshotOfLocked(appt) };
    });
    await auditPackageChange(args.appointmentId, args.actor, snapshot, null, describe(summary));
    return { ok: true, redemption: summary };
  } catch (e) {
    if (e instanceof RedeemAbort) return e.result;
    throw e;
  }
}

type LockedAppointment = NonNullable<Awaited<ReturnType<typeof lockAppointment>>>;
type PackageRow = Awaited<ReturnType<typeof lockActivePackages>>[number];

function snapshotOfLocked(appt: LockedAppointment) {
  return { patientName: `${appt.patient.firstName} ${appt.patient.lastName}`, dateTime: appt.dateTime };
}

function choosePackage(packages: PackageRow[], appt: LockedAppointment, requestedId?: string | null): PackageRow {
  if (requestedId) {
    const pkg = packages.find((p) => p.id === requestedId);
    if (!pkg) throw new RedeemAbort({ ok: false, error: "package_not_found" });
    const reason = ineligibilityReason(pkg, appt.treatmentType, appt.dateTime);
    if (reason) throw new RedeemAbort({ ok: false, error: "package_not_eligible", reason });
    return pkg;
  }
  const picked = pickPackageForAppointment(packages, appt.treatmentType, appt.dateTime, appt.series?.patientPackageId);
  if (!picked) throw new RedeemAbort({ ok: false, error: "no_package" });
  return picked;
}

/**
 * Undo the appointment's active redemption and give the session back. Returns
 * null when there was nothing to reverse.
 */
export async function reverseRedemption(args: {
  appointmentId: string;
  actor: ActorContext | null;
  now?: Date;
}): Promise<RedemptionSummaryJson | null> {
  const now = args.now ?? new Date();
  const result = await prisma.$transaction(async (tx) => {
    const appt = await lockAppointment(tx, args.appointmentId);
    if (!appt || appt.redemptions.length === 0) return null;
    const redemption = await tx.packageRedemption.update({
      where: { id: appt.redemptions[0].id },
      data: { reversedAt: now, reversedById: args.actor?.id ?? null },
    });
    await tx.$queryRaw`SELECT id FROM "PatientPackage" WHERE id = ${redemption.patientPackageId} FOR UPDATE`;
    const pkg = await tx.patientPackage.findUniqueOrThrow({ where: { id: redemption.patientPackageId } });
    const reopen = pkg.status === "COMPLETED";
    const expired = !!pkg.expiresAt && pkg.expiresAt.getTime() <= now.getTime();
    const updated = await tx.patientPackage.update({
      where: { id: pkg.id },
      data: {
        sessionsUsed: Math.max(0, pkg.sessionsUsed - 1),
        ...(reopen ? { status: expired ? ("EXPIRED" as const) : ("ACTIVE" as const) } : {}),
      },
    });
    return { summary: toSummary(redemption, updated), snapshot: snapshotOfLocked(appt) };
  });
  if (!result) return null;
  await auditPackageChange(args.appointmentId, args.actor, result.snapshot, describe(result.summary), null);
  return result.summary;
}

function describe(s: RedemptionSummaryJson): string {
  return `${s.packageName} (${s.sessionsUsed} of ${s.sessionsTotal} used)`;
}

async function auditPackageChange(
  appointmentId: string,
  actor: ActorContext | null,
  snapshot: { patientName: string; dateTime: Date },
  from: string | null,
  to: string | null,
): Promise<void> {
  await logAppointmentEvent({ appointmentId, action: "UPDATE", actor, snapshot, changes: { package: { from, to } } });
}

/** The appointment's active redemption, for appointment payloads. */
export async function activeRedemptionFor(appointmentId: string): Promise<RedemptionSummaryJson | null> {
  const r = await prisma.packageRedemption.findFirst({
    where: { appointmentId, reversedAt: null },
    select: {
      id: true,
      appointmentId: true,
      redeemedAt: true,
      patientPackage: { select: { id: true, name: true, sessionsUsed: true, sessionsTotal: true } },
    },
  });
  return r ? toSummary(r, r.patientPackage) : null;
}

/** Cron sweep: stored ACTIVE packages past their expiry become EXPIRED. */
export async function expireOverduePackages(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.patientPackage.updateMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  return count;
}
