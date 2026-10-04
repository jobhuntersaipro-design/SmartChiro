import { z } from "zod";
import type { BranchRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyUpdate, diffSnapshots, logAppointmentEvent, type ActorContext } from "@/lib/appointment-audit";
import { reverseRedemption } from "@/lib/package-service";
import { checkOccurrences, occurrenceToJson, serializeSeriesAppointment, type OccurrenceCheck } from "@/lib/series-service";
import type { OccurrenceProblem } from "@/types/packages";
import { can } from "@/lib/permissions";

/**
 * PATCH /api/appointments/[id]?scope=following — "This and following" edits on
 * a series: shift time (same delta), change doctor or duration, or cancel,
 * for this occurrence and every later one that is still booked and in the
 * future. Completed / past occurrences are never touched. Every moved
 * occurrence is re-checked; problems return 409 with the list unless `force`.
 */

export const FollowingBody = z
  .object({
    dateTime: z.string().datetime().optional(),
    doctorId: z.string().min(1).optional(),
    duration: z.number().int().positive().max(480).optional(),
    status: z.literal("CANCELLED").optional(),
    /** Apply despite problems (OWNER/ADMIN; a DOCTOR may only force past opening hours). */
    force: z.boolean().optional(),
    forceOutsideHours: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Boolean(d.dateTime || d.doctorId || d.duration || d.status), "nothing to change");

export interface FollowingResult {
  status: number;
  body: Record<string, unknown>;
}

const BOOKED = ["SCHEDULED", "CHECKED_IN"] as const;

interface Target {
  id: string;
  seriesIndex: number | null;
  dateTime: Date;
  duration: number;
  doctorId: string;
  status: string;
}

interface Planned extends Target {
  newStart: Date;
  newDuration: number;
  newDoctorId: string;
}

async function loadTargets(seriesId: string, from: Date, now: Date): Promise<Target[]> {
  return prisma.appointment.findMany({
    where: { seriesId, dateTime: { gte: from, gt: now }, status: { in: [...BOOKED] } },
    orderBy: { dateTime: "asc" },
    select: { id: true, seriesIndex: true, dateTime: true, duration: true, doctorId: true, status: true },
  });
}

/** Re-run the booking checks for every moved occurrence, grouped by doctor. */
async function checkPlanned(planned: Planned[], branchId: string, now: Date): Promise<Map<string, OccurrenceCheck>> {
  const excludeIds = planned.map((p) => p.id);
  const byDoctor = new Map<string, Planned[]>();
  for (const p of planned) byDoctor.set(p.newDoctorId, [...(byDoctor.get(p.newDoctorId) ?? []), p]);
  const out = new Map<string, OccurrenceCheck>();
  for (const [doctorId, rows] of byDoctor) {
    const checks = await checkOccurrences({
      doctorId,
      branchId,
      windows: rows.map((r) => ({ start: r.newStart, duration: r.newDuration })),
      excludeIds,
      now,
    });
    rows.forEach((r, i) => out.set(r.id, checks[i]));
  }
  return out;
}

function blockingProblems(problems: OccurrenceProblem[], role: BranchRole, force: boolean, forceHours: boolean): OccurrenceProblem[] {
  return problems.filter((p) => {
    if (p === "past") return true;
    if (p === "outside_hours" && (force || forceHours)) return false;
    return !(force && can(role, "appointment.manageAll"));
  });
}

export async function editFollowing(args: {
  appointmentId: string;
  input: unknown;
  actor: ActorContext;
  role: BranchRole;
  now?: Date;
}): Promise<FollowingResult> {
  const now = args.now ?? new Date();
  const parsed = FollowingBody.safeParse(args.input);
  if (!parsed.success) {
    return {
      status: 422,
      body: {
        error: "validation",
        message: "Only time, doctor, duration or cancel can apply to following appointments.",
        details: parsed.error.flatten(),
      },
    };
  }
  const d = parsed.data;
  const appt = await prisma.appointment.findUnique({
    where: { id: args.appointmentId },
    select: { id: true, seriesId: true, dateTime: true, branchId: true, patient: { select: { firstName: true, lastName: true } } },
  });
  if (!appt) return { status: 404, body: { error: "not_found", message: "Appointment not found." } };
  if (!appt.seriesId) return { status: 422, body: { error: "not_in_series", message: "This appointment is not part of a series." } };
  if (d.dateTime && appt.dateTime.getTime() < now.getTime()) {
    return { status: 422, body: { error: "cannot_reschedule_past", message: "Past appointments can't be moved." } };
  }
  // Same rules as a single edit: only roles that book for any doctor may
  // reassign, and only to a clinician in this branch.
  const managesAll = can(args.role, "appointment.manageAll");
  if (d.doctorId) {
    if (!managesAll) return { status: 403, body: { error: "forbidden", message: "Only the front desk or a manager can change the doctor." } };
    const member = await prisma.branchMember.findUnique({
      where: { userId_branchId: { userId: d.doctorId, branchId: appt.branchId } },
      select: { role: true },
    });
    if (!member || !can(member.role, "clinical.read")) {
      return { status: 422, body: { error: "doctor_not_in_branch", message: "The doctor is not a member of this branch." } };
    }
  }

  // A doctor only changes their own occurrences, never a colleague's.
  const targets = (await loadTargets(appt.seriesId, appt.dateTime, now)).filter(
    (t) => managesAll || t.doctorId === args.actor.id,
  );
  if (targets.length === 0) {
    return { status: 422, body: { error: "nothing_to_change", message: "No upcoming booked appointments in this series." } };
  }
  const delta = d.dateTime ? new Date(d.dateTime).getTime() - appt.dateTime.getTime() : 0;
  const planned: Planned[] = targets.map((t) => ({
    ...t,
    newStart: new Date(t.dateTime.getTime() + delta),
    newDuration: d.duration ?? t.duration,
    newDoctorId: d.doctorId ?? t.doctorId,
  }));

  if (d.status !== "CANCELLED") {
    const checks = await checkPlanned(planned, appt.branchId, now);
    const blocked = planned
      .map((p) => ({ p, check: checks.get(p.id)! }))
      .filter(({ check }) => blockingProblems(check.problems, args.role, !!d.force, !!d.forceOutsideHours).length > 0);
    if (blocked.length > 0) {
      return {
        status: 409,
        body: {
          error: "series_problems",
          message: `${blocked.length} of ${planned.length} appointments can't be moved. Nothing was changed.`,
          occurrences: blocked.map(({ p, check }) => ({ appointmentId: p.id, seriesIndex: p.seriesIndex, ...occurrenceToJson(check) })),
        },
      };
    }
  }

  const patientName = `${appt.patient.firstName} ${appt.patient.lastName}`;
  const updated = await applyPlanned(planned, d.status === "CANCELLED");
  await afterApply(planned, updated, d.status === "CANCELLED" ? "pending" : delta !== 0 ? "all" : "none", args.actor, patientName);
  const anchor = updated.find((u) => u.id === appt.id) ?? null;
  return {
    status: 200,
    body: { appointment: anchor, updated: updated.map(serializeSeriesAppointment), count: updated.length },
  };
}

async function applyPlanned(planned: Planned[], cancel: boolean) {
  return prisma.$transaction(
    planned.map((p) =>
      prisma.appointment.update({
        where: { id: p.id },
        data: cancel
          ? { status: "CANCELLED" }
          : { dateTime: p.newStart, duration: p.newDuration, doctorId: p.newDoctorId },
      }),
    ),
  );
}

type Updated = Awaited<ReturnType<typeof applyPlanned>>;

/** Reminders re-materialise at the new times, redemptions on cancelled visits are given back, audit rows. */
/** Reminders: a move drops every row (sent ones too) so the new times get reminders; a cancel drops pending ones. */
async function afterApply(
  planned: Planned[],
  updated: Updated,
  clearReminders: "none" | "pending" | "all",
  actor: ActorContext,
  patientName: string,
) {
  const ids = planned.map((p) => p.id);
  if (clearReminders !== "none") {
    await prisma.appointmentReminder.deleteMany({
      where: { appointmentId: { in: ids }, ...(clearReminders === "pending" ? { status: "PENDING" as const } : {}) },
    });
  }
  const cancelled = updated.filter((u) => u.status === "CANCELLED").map((u) => u.id);
  if (cancelled.length > 0) {
    const redeemed = await prisma.packageRedemption.findMany({
      where: { appointmentId: { in: cancelled }, reversedAt: null },
      select: { appointmentId: true },
    });
    for (const r of redeemed) await reverseRedemption({ appointmentId: r.appointmentId, actor });
  }
  await Promise.all(
    planned.map((p, i) => {
      const u = updated[i];
      const changes = diffSnapshots(
        { dateTime: p.dateTime.toISOString(), duration: p.duration, doctorId: p.doctorId, status: p.status },
        { dateTime: u.dateTime.toISOString(), duration: u.duration, doctorId: u.doctorId, status: u.status },
      );
      if (Object.keys(changes).length === 0) return Promise.resolve();
      return logAppointmentEvent({
        appointmentId: p.id,
        action: classifyUpdate(changes),
        actor,
        snapshot: { patientName, dateTime: u.dateTime },
        changes: { ...changes, scope: { from: null, to: "following" } } as unknown as Parameters<typeof logAppointmentEvent>[0]["changes"],
      });
    }),
  );
}
