import type { AppointmentAuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface ActorContext {
  id: string;
  email: string;
  name: string | null;
}

export interface AppointmentSnapshot {
  patientName: string;
  dateTime: Date;
}

/**
 * Lightweight diff between two plain objects — returns only the fields that actually changed.
 * Mirrors the pattern in src/lib/branch-audit.ts (`diffSnapshots`) so the audit-log UI can render
 * `Field: <old> → <new>` rows the same way for both branch and appointment events.
 */
export function diffSnapshots<T extends Record<string, unknown>>(
  before: Partial<T>,
  after: Partial<T>
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = before[k as keyof T];
    const b = after[k as keyof T];
    if (!shallowEqual(a, b)) changes[k] = { from: a ?? null, to: b ?? null };
  }
  return changes;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/**
 * Append one row to AppointmentAuditLog. Fail-soft: any DB error is caught and logged
 * so audit failures never break the user-facing operation.
 */
export async function logAppointmentEvent(args: {
  appointmentId: string;
  action: AppointmentAuditAction;
  actor: ActorContext | null;
  snapshot: AppointmentSnapshot;
  changes: Prisma.InputJsonValue;
  client?: Prisma.TransactionClient;
}): Promise<void> {
  const { appointmentId, action, actor, snapshot, changes } = args;
  const db = args.client ?? prisma;
  try {
    await db.appointmentAuditLog.create({
      data: {
        appointmentId,
        action,
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? "system",
        actorName: actor?.name ?? null,
        patientNameAtEvent: snapshot.patientName,
        dateTimeAtEvent: snapshot.dateTime,
        changes,
      },
    });
  } catch (e) {
    console.error("appointment audit log write failed", { appointmentId, action, error: e });
  }
}

/** Audited fields on Appointment — used for diff capture on UPDATE. */
export const AUDITED_APPOINTMENT_FIELDS = [
  "dateTime",
  "duration",
  "status",
  "notes",
  "doctorId",
  "treatmentType",
] as const;
export type AuditedAppointmentField = (typeof AUDITED_APPOINTMENT_FIELDS)[number];

/** Pull only audited fields from an Appointment-shaped row. */
export function snapshotOf<T extends Record<string, unknown>>(
  row: T
): Partial<Record<AuditedAppointmentField, unknown>> {
  const out: Partial<Record<AuditedAppointmentField, unknown>> = {};
  for (const k of AUDITED_APPOINTMENT_FIELDS) {
    if (k in row) out[k] = row[k as keyof T];
  }
  return out;
}

/**
 * Decide which AuditAction best describes a given change set. Used by PATCH so the
 * audit-log timeline can show "Rescheduled" / "Status changed" instead of generic
 * "Updated" when only one meaningful field moved.
 */
export function classifyUpdate(
  changes: Record<string, { from: unknown; to: unknown }>
): AppointmentAuditAction {
  const keys = Object.keys(changes);
  if (keys.length === 0) return "UPDATE";
  if (keys.length === 1) {
    const only = keys[0];
    if (only === "dateTime") return "RESCHEDULE";
    if (only === "doctorId") return "DOCTOR_REASSIGN";
    if (only === "status") {
      if (changes.status.to === "CANCELLED") return "CANCEL";
      return "STATUS_CHANGE";
    }
    if (only === "notes") return "NOTE_EDIT";
  }
  // dateTime + duration together still reads as a reschedule
  if (keys.every((k) => k === "dateTime" || k === "duration")) return "RESCHEDULE";
  return "UPDATE";
}
