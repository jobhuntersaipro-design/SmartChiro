import { z } from "zod";
import { TreatmentType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserBranchRole } from "@/lib/auth-utils";
import { findConflictsForWindows, type AppointmentConflict } from "@/lib/appointments";
import { findOverlappingBreak, isOnTimeOff } from "@/lib/availability";
import { outsideHoursSummary } from "@/lib/operating-hours";
import { logAppointmentEvent, type ActorContext } from "@/lib/appointment-audit";
import { clinicDateKey, clinicInstantFromInputs } from "@/lib/clinic-time";
import { MAX_SERIES_OCCURRENCES, expandSeries, type SeriesRule } from "@/lib/series";
import type {
  AppointmentSeriesJson,
  OccurrenceCheckJson,
  OccurrenceProblem,
  SeriesAppointmentJson,
  TreatmentTypeValue,
} from "@/types/packages";
import { can } from "@/lib/permissions";
import { isClinician } from "@/lib/clinician";

/**
 * Database side of recurring appointment series (Phase 3): input schema,
 * booking context (same RBAC as POST /api/appointments), per-occurrence
 * checks and creation.
 */

type Tx = Prisma.TransactionClient;

export const TreatmentTypeSchema = z.enum(TreatmentType);
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const SeriesRuleSchema = z.object({
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM"),
  intervalWeeks: z.number().int().min(1).max(12).default(1),
  count: z.number().int().min(1).max(MAX_SERIES_OCCURRENCES).optional(),
  until: IsoDateSchema.optional(),
  startDate: IsoDateSchema,
});
export type SeriesRuleInput = z.infer<typeof SeriesRuleSchema>;

export const seriesRuleHasEnd = (r: { count?: number; until?: string }) => r.count !== undefined || r.until !== undefined;

export function ruleFromInput(r: SeriesRuleInput): SeriesRule {
  return {
    weekdays: [...new Set(r.weekdays)].sort((a, b) => a - b),
    startTime: r.startTime,
    intervalWeeks: r.intervalWeeks,
    count: r.count ?? null,
    until: r.until ? clinicInstantFromInputs(r.until) : null,
    startDate: clinicInstantFromInputs(r.startDate),
  };
}

// ─── Booking context ───

export interface BookingContext {
  branchId: string;
  doctorId: string;
  role: NonNullable<Awaited<ReturnType<typeof getUserBranchRole>>>;
  patient: { id: string; firstName: string; lastName: string } | null;
}

export type ContextResult =
  | { ok: true; ctx: BookingContext }
  | { ok: false; status: number; error: string; message: string };

/**
 * Same rules as POST /api/appointments: caller is a branch member (404 when
 * not), the patient belongs to the branch, a DOCTOR books only themselves and
 * the doctor is a member of the branch.
 */
export async function resolveBookingContext(
  userId: string,
  input: { branchId: string; doctorId: string; patientId?: string },
): Promise<ContextResult> {
  const role = await getUserBranchRole(userId, input.branchId);
  if (!role) return { ok: false, status: 404, error: "not_found", message: "Branch not found." };
  let patient: BookingContext["patient"] = null;
  if (input.patientId) {
    const row = await prisma.patient.findUnique({
      where: { id: input.patientId },
      select: { id: true, branchId: true, firstName: true, lastName: true },
    });
    if (!row || row.branchId !== input.branchId) {
      return { ok: false, status: 404, error: "patient_not_found", message: "Patient not found in this branch." };
    }
    patient = { id: row.id, firstName: row.firstName, lastName: row.lastName };
  }
  if (!can(role, "appointment.manageAll") && input.doctorId !== userId) {
    return { ok: false, status: 403, error: "forbidden", message: "Doctors can only book their own appointments." };
  }
  const member = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: input.doctorId, branchId: input.branchId } },
    select: { userId: true, role: true, user: { select: { doctorProfile: { select: { id: true } } } } },
  });
  if (!member) {
    return { ok: false, status: 422, error: "doctor_not_in_branch", message: "The doctor is not a member of this branch." };
  }
  if (!isClinician(member.role, !!member.user.doctorProfile)) {
    return { ok: false, status: 422, error: "not_a_clinician", message: "Appointments must be with a doctor." };
  }
  return { ok: true, ctx: { branchId: input.branchId, doctorId: input.doctorId, role, patient } };
}

// ─── Per-occurrence checks ───

export interface OccurrenceWindow {
  start: Date;
  duration: number;
}

export interface OccurrenceCheck {
  dateTime: Date;
  ok: boolean;
  problems: OccurrenceProblem[];
  conflicts: AppointmentConflict[];
  breakLabel?: string;
  hours?: string;
}

/**
 * The booking checks of POST /api/appointments (conflict, break, opening
 * hours) plus past and doctor time-off, for every window of one doctor.
 * `excludeIds` are appointments being moved (they can't conflict with themselves).
 */
export async function checkOccurrences(args: {
  doctorId: string;
  branchId: string;
  windows: OccurrenceWindow[];
  excludeIds?: string[];
  now?: Date;
}): Promise<OccurrenceCheck[]> {
  const { doctorId, branchId, windows } = args;
  if (windows.length === 0) return [];
  const now = args.now ?? new Date();
  const ranges = windows.map((w) => ({ start: w.start, end: new Date(w.start.getTime() + w.duration * 60_000) }));
  const first = new Date(Math.min(...ranges.map((r) => r.start.getTime())));
  const last = new Date(Math.max(...ranges.map((r) => r.end.getTime())));
  const [conflicts, breaks, timeOff, branch] = await Promise.all([
    findConflictsForWindows({ doctorId, windows: ranges, excludeIds: args.excludeIds }),
    prisma.doctorBreakTime.findMany({
      where: { userId: doctorId, branchId },
      select: { userId: true, branchId: true, dayOfWeek: true, startMinute: true, endMinute: true, label: true },
    }),
    prisma.doctorTimeOff.findMany({
      where: { userId: doctorId, OR: [{ branchId: null }, { branchId }], startDate: { lt: last }, endDate: { gt: first } },
      select: { userId: true, branchId: true, type: true, startDate: true, endDate: true, notes: true },
    }),
    prisma.branch.findUnique({ where: { id: branchId }, select: { operatingHours: true } }),
  ]);
  return windows.map((w, i) => {
    const problems: OccurrenceProblem[] = [];
    const check: OccurrenceCheck = { dateTime: w.start, ok: true, problems, conflicts: conflicts[i] };
    if (w.start.getTime() <= now.getTime()) problems.push("past");
    if (conflicts[i].length > 0) problems.push("conflict");
    const onBreak = findOverlappingBreak(doctorId, ranges[i].start, ranges[i].end, breaks);
    if (onBreak) {
      problems.push("break");
      check.breakLabel = onBreak.label ?? "Break time";
    }
    const hours = outsideHoursSummary(branch?.operatingHours, w.start, w.duration);
    if (hours) {
      problems.push("outside_hours");
      check.hours = hours;
    }
    if (isOnTimeOff(doctorId, w.start, timeOff)) problems.push("time_off");
    check.ok = problems.length === 0;
    return check;
  });
}

export function occurrenceToJson(c: OccurrenceCheck): OccurrenceCheckJson {
  return {
    dateTime: c.dateTime.toISOString(),
    ok: c.ok,
    problems: c.problems,
    ...(c.conflicts.length > 0
      ? {
          conflicts: c.conflicts.map((x) => ({
            id: x.id,
            dateTime: x.dateTime.toISOString(),
            duration: x.duration,
            patient: x.patient,
          })),
        }
      : {}),
    ...(c.breakLabel ? { breakLabel: c.breakLabel } : {}),
    ...(c.hours ? { hours: c.hours } : {}),
  };
}

/** Expand a rule and check each occurrence — the dry run behind preview and create. */
export async function planSeries(args: {
  rule: SeriesRule;
  doctorId: string;
  branchId: string;
  duration: number;
  now?: Date;
}): Promise<OccurrenceCheck[]> {
  const now = args.now ?? new Date();
  const starts = expandSeries(args.rule, now);
  return checkOccurrences({
    doctorId: args.doctorId,
    branchId: args.branchId,
    windows: starts.map((start) => ({ start, duration: args.duration })),
    now,
  });
}

export type SplitResult =
  | { ok: true; starts: Date[]; skipped: OccurrenceCheck[] }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Which occurrences to book. With problems and `skipProblemDates` false the
 * whole request is refused (409 `series_problems`) so the user can adjust.
 */
export function splitOccurrences(checks: OccurrenceCheck[], skipProblemDates: boolean): SplitResult {
  if (checks.length === 0) {
    return {
      ok: false,
      status: 422,
      body: { error: "no_occurrences", message: "The repeat rule gives no future dates." },
    };
  }
  const skipped = checks.filter((c) => !c.ok);
  if (skipped.length > 0 && !skipProblemDates) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "series_problems",
        message: `${skipped.length} of ${checks.length} dates can't be booked. Skip them or change the repeat.`,
        occurrences: checks.map(occurrenceToJson),
      },
    };
  }
  const starts = checks.filter((c) => c.ok).map((c) => c.dateTime);
  if (starts.length === 0) {
    return {
      ok: false,
      status: 422,
      body: { error: "no_valid_occurrences", message: "None of the dates can be booked.", occurrences: checks.map(occurrenceToJson) },
    };
  }
  return { ok: true, starts, skipped };
}

// ─── Creation ───

export interface CreateSeriesInput {
  patientId: string;
  branchId: string;
  doctorId: string;
  treatmentType: TreatmentType | null;
  duration: number;
  room: string | null;
  notes: string | null;
  rule: SeriesRule;
  carePlanId: string | null;
  patientPackageId: string | null;
  createdById: string;
  /** Occurrences to book, in order. */
  starts: Date[];
}

/** Creates the series and its appointments (seriesIndex 1…n in date order). */
export async function createSeriesWithAppointments(tx: Tx, input: CreateSeriesInput) {
  const series = await tx.appointmentSeries.create({
    data: {
      patientId: input.patientId,
      branchId: input.branchId,
      doctorId: input.doctorId,
      treatmentType: input.treatmentType,
      duration: input.duration,
      room: input.room,
      weekdays: input.rule.weekdays,
      startTime: input.rule.startTime,
      intervalWeeks: input.rule.intervalWeeks,
      count: input.rule.count ?? null,
      until: input.rule.until ?? null,
      startDate: input.rule.startDate,
      carePlanId: input.carePlanId,
      patientPackageId: input.patientPackageId,
      createdById: input.createdById,
    },
  });
  const starts = [...input.starts].sort((a, b) => a.getTime() - b.getTime());
  const appointments = await tx.appointment.createManyAndReturn({
    data: starts.map((dateTime, i) => ({
      patientId: input.patientId,
      doctorId: input.doctorId,
      branchId: input.branchId,
      dateTime,
      duration: input.duration,
      status: "SCHEDULED" as const,
      notes: input.notes,
      treatmentType: input.treatmentType,
      room: input.room ?? null,
      seriesId: series.id,
      seriesIndex: i + 1,
    })),
  });
  appointments.sort((a, b) => (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0));
  return { series, appointments };
}

type CreatedAppointment = Awaited<ReturnType<typeof createSeriesWithAppointments>>["appointments"][number];

/** CREATE audit rows for a new series' appointments (fail-soft, after the transaction). */
export async function logSeriesCreated(
  appointments: CreatedAppointment[],
  actor: ActorContext,
  patientName: string,
): Promise<void> {
  await Promise.all(
    appointments.map((a) =>
      logAppointmentEvent({
        appointmentId: a.id,
        action: "CREATE",
        actor,
        snapshot: { patientName, dateTime: a.dateTime },
        changes: {
          dateTime: { from: null, to: a.dateTime.toISOString() },
          doctorId: { from: null, to: a.doctorId },
          duration: { from: null, to: a.duration },
          status: { from: null, to: a.status },
          treatmentType: { from: null, to: a.treatmentType ?? null },
          notes: { from: null, to: a.notes ?? null },
          seriesId: { from: null, to: a.seriesId },
        },
      }),
    ),
  );
}

// ─── Serialisation ───

export function serializeSeriesAppointment(a: CreatedAppointment): SeriesAppointmentJson {
  return {
    id: a.id,
    seriesIndex: a.seriesIndex,
    dateTime: a.dateTime.toISOString(),
    duration: a.duration,
    status: a.status,
    doctorId: a.doctorId,
    treatmentType: a.treatmentType as TreatmentTypeValue | null,
  };
}

type SeriesRow = Prisma.AppointmentSeriesGetPayload<object>;

export function serializeSeries(
  s: SeriesRow,
  doctor: { id: string; name: string | null },
  appointments?: CreatedAppointment[],
): AppointmentSeriesJson {
  return {
    id: s.id,
    patientId: s.patientId,
    branchId: s.branchId,
    doctor,
    treatmentType: s.treatmentType as TreatmentTypeValue | null,
    duration: s.duration,
    room: s.room,
    weekdays: s.weekdays,
    startTime: s.startTime,
    intervalWeeks: s.intervalWeeks,
    count: s.count,
    until: s.until ? clinicDateKey(s.until) : null,
    startDate: clinicDateKey(s.startDate),
    carePlanId: s.carePlanId,
    patientPackageId: s.patientPackageId,
    createdAt: s.createdAt.toISOString(),
    ...(appointments ? { appointments: appointments.map(serializeSeriesAppointment) } : {}),
  };
}
