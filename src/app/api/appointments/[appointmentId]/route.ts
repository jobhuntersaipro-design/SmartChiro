import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { can } from "@/lib/permissions";
import { findConflictingAppointments } from "@/lib/appointments";
import { logAppointmentEvent, diffSnapshots, snapshotOf, classifyUpdate } from "@/lib/appointment-audit";
import { outsideHoursSummary } from "@/lib/operating-hours";
import { activeRedemptionFor, redeemAppointment, reverseRedemption } from "@/lib/package-service";
import { editFollowing } from "@/lib/series-following";
import type { RedemptionSummaryJson } from "@/types/packages";
import { paywall } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ appointmentId: string }> };

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { appointmentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      dateTime: true,
      duration: true,
      status: true,
      notes: true,
      room: true,
      treatmentType: true,
      source: true,
      branchId: true,
      seriesId: true,
      seriesIndex: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      doctor: { select: { id: true, name: true } },
    },
  });
  if (!appt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getUserBranchRole(user.id, appt.branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    appointment: {
      id: appt.id,
      dateTime: appt.dateTime.toISOString(),
      duration: appt.duration,
      status: appt.status,
      notes: appt.notes,
      room: appt.room,
      treatmentType: appt.treatmentType,
      source: appt.source,
      branchId: appt.branchId,
      patient: appt.patient,
      doctor: appt.doctor,
      seriesId: appt.seriesId,
      seriesIndex: appt.seriesIndex,
      redemption: await activeRedemptionFor(appt.id),
    },
  });
}

const Body = z
  .object({
    dateTime: z.string().datetime().optional(),
    status: z
      .enum(["SCHEDULED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"])
      .optional(),
    duration: z.number().int().positive().optional(),
    notes: z.string().nullable().optional(),
    doctorId: z.string().optional(),
    treatmentType: z
      .enum([
        "INITIAL_CONSULT",
        "ADJUSTMENT",
        "GONSTEAD",
        "DIVERSIFIED",
        "ACTIVATOR",
        "DROP_TABLE",
        "SOFT_TISSUE",
        "SPINAL_DECOMPRESSION",
        "REHAB_EXERCISE",
        "X_RAY",
        "FOLLOW_UP",
        "WELLNESS_CHECK",
        "PEDIATRIC",
        "PRENATAL",
        "SPORTS_REHAB",
        "OTHER",
      ])
      .nullable()
      .optional(),
    /** Free-text treatment room; "" or null clears it. */
    room: z.string().trim().max(60).nullable().optional(),
    /** Bypass the outside-opening-hours confirmation on a reschedule. */
    forceOutsideHours: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "at least one field required");

export async function PATCH(req: Request, ctx: RouteCtx): Promise<Response> {
  const { appointmentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const blocked = await paywall(user.id);
  if (blocked) return blocked;

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      branchId: true,
      doctorId: true,
      dateTime: true,
      duration: true,
      status: true,
      notes: true,
      treatmentType: true,
      room: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  if (!appt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getUserBranchRole(user.id, appt.branchId);
  // OWNER/ADMIN/FRONT_DESK edit any appointment in the branch; a DOCTOR only their own.
  const managesAll = can(role, "appointment.manageAll");
  if (!managesAll && appt.doctorId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const actor = { id: user.id, email: user.email ?? "unknown", name: user.name ?? null };

  // "This and following" on a recurring series.
  if (new URL(req.url).searchParams.get("scope") === "following") {
    const result = await editFollowing({
      appointmentId,
      input: await req.json().catch(() => null),
      actor,
      role: role ?? "DOCTOR",
    });
    return NextResponse.json(result.body, { status: result.status });
  }

  const isPast = appt.dateTime.getTime() < Date.now();

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  // Once the start time has passed, a DOCTOR (not OWNER/ADMIN/FRONT_DESK) may still move
  // their own appointment through the day — check in a late patient, start,
  // complete, mark no-show — but can't edit anything else on it.
  const statusOnly = Object.keys(parsed.data).every((k) => k === "status");
  if (isPast && !managesAll && !statusOnly) {
    return NextResponse.json({ error: "forbidden_past_edit" }, { status: 403 });
  }

  // Past-edit guard: cannot reschedule a past appointment (block dateTime/doctorId changes).
  if (isPast && (parsed.data.dateTime !== undefined || parsed.data.doctorId !== undefined)) {
    return NextResponse.json(
      { error: "cannot_reschedule_past" },
      { status: 422 }
    );
  }

  // Past-time guard: reject moving a future appointment to a time in the past.
  if (parsed.data.dateTime !== undefined) {
    const newStart = new Date(parsed.data.dateTime);
    if (newStart.getTime() < Date.now()) {
      return NextResponse.json({ error: "past_datetime" }, { status: 422 });
    }
  }

  // Conflict check: if dateTime, duration, or doctorId changes, ensure the new window
  // doesn't overlap another SCHEDULED/CHECKED_IN appointment for the (new) doctor.
  const dateTimeWillChange =
    parsed.data.dateTime !== undefined &&
    new Date(parsed.data.dateTime).getTime() !== appt.dateTime.getTime();
  const durationWillChange =
    parsed.data.duration !== undefined && parsed.data.duration !== appt.duration;
  const doctorWillChange =
    parsed.data.doctorId !== undefined && parsed.data.doctorId !== appt.doctorId;

  // Reassigning: only roles that book for any doctor, and only to a clinician
  // in this branch (front desk is never bookable).
  if (doctorWillChange) {
    if (!managesAll) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const newDoctor = await prisma.branchMember.findUnique({
      where: { userId_branchId: { userId: parsed.data.doctorId!, branchId: appt.branchId } },
      select: { role: true },
    });
    if (!newDoctor || !can(newDoctor.role, "clinical.read")) {
      return NextResponse.json({ error: "doctor_not_in_branch" }, { status: 422 });
    }
  }

  if (dateTimeWillChange || durationWillChange || doctorWillChange) {
    const newStart = parsed.data.dateTime ? new Date(parsed.data.dateTime) : appt.dateTime;
    const newDuration = parsed.data.duration ?? appt.duration;
    const newEnd = new Date(newStart.getTime() + newDuration * 60_000);
    const newDoctorId = parsed.data.doctorId ?? appt.doctorId;
    const conflicts = await findConflictingAppointments({
      doctorId: newDoctorId,
      start: newStart,
      end: newEnd,
      excludeId: appointmentId,
    });
    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          error: "conflict",
          conflicts: conflicts.map((c) => ({
            id: c.id,
            dateTime: c.dateTime.toISOString(),
            duration: c.duration,
            patient: c.patient,
          })),
        },
        { status: 409 }
      );
    }

    // Opening-hours confirmation gate on a reschedule / duration change —
    // skipped when the branch has no hours set.
    if ((dateTimeWillChange || durationWillChange) && parsed.data.forceOutsideHours !== true) {
      const branch = await prisma.branch.findUnique({
        where: { id: appt.branchId },
        select: { operatingHours: true },
      });
      const hours = outsideHoursSummary(branch?.operatingHours, newStart, newDuration);
      if (hours) {
        return NextResponse.json({ error: "outside_hours_confirm_required", hours }, { status: 409 });
      }
    }
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.dateTime !== undefined) updateData.dateTime = new Date(parsed.data.dateTime);
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.duration !== undefined) updateData.duration = parsed.data.duration;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.doctorId !== undefined) updateData.doctorId = parsed.data.doctorId;
  if (parsed.data.treatmentType !== undefined) updateData.treatmentType = parsed.data.treatmentType;
  if (parsed.data.room !== undefined) updateData.room = parsed.data.room || null;

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: updateData,
  });

  // Audit — diff the audited fields and choose a specific action verb when possible
  const before = snapshotOf({
    dateTime: appt.dateTime,
    duration: appt.duration,
    status: appt.status,
    notes: appt.notes,
    doctorId: appt.doctorId,
    treatmentType: appt.treatmentType,
    room: appt.room,
  });
  const after = snapshotOf({
    dateTime: updated.dateTime,
    duration: updated.duration,
    status: updated.status,
    notes: updated.notes,
    doctorId: updated.doctorId,
    treatmentType: updated.treatmentType,
    room: updated.room,
  });
  // Normalize Date → ISO string for diff comparison
  const beforeForDiff = {
    ...before,
    dateTime: appt.dateTime.toISOString(),
  };
  const afterForDiff = {
    ...after,
    dateTime: updated.dateTime.toISOString(),
  };
  const changes = diffSnapshots(beforeForDiff, afterForDiff);
  if (Object.keys(changes).length > 0) {
    const patientName = appt.patient
      ? `${appt.patient.firstName} ${appt.patient.lastName}`
      : "Unknown patient";
    await logAppointmentEvent({
      appointmentId,
      action: classifyUpdate(changes),
      actor: { id: user.id, email: user.email ?? "unknown", name: user.name ?? null },
      snapshot: { patientName, dateTime: updated.dateTime },
      changes: changes as unknown as Parameters<typeof logAppointmentEvent>[0]["changes"],
    });
  }

  // Reschedule / cancel hook: clear PENDING reminders so they re-materialize at the new time
  // (or simply stay cleared if status moved away from SCHEDULED).
  const dateTimeChanged =
    parsed.data.dateTime !== undefined &&
    new Date(parsed.data.dateTime).getTime() !== appt.dateTime.getTime();
  const movedAwayFromScheduled =
    parsed.data.status !== undefined && parsed.data.status !== "SCHEDULED";

  if (dateTimeChanged || movedAwayFromScheduled) {
    await prisma.appointmentReminder.deleteMany({
      where: { appointmentId, status: "PENDING" },
    });
  }

  // Packages: completing a visit uses a session of a matching package (unless
  // it is invoiced or already redeemed); cancelling, or undoing "Completed",
  // gives the session back.
  let redemption: RedemptionSummaryJson | null = null;
  const next = parsed.data.status;
  if (next === "COMPLETED" && appt.status !== "COMPLETED") {
    const result = await redeemAppointment({ appointmentId, actor });
    redemption = result.ok ? result.redemption : await activeRedemptionFor(appointmentId);
  } else if (
    next !== undefined &&
    next !== "COMPLETED" &&
    (appt.status === "COMPLETED" || (next === "CANCELLED" && appt.status !== "CANCELLED"))
  ) {
    await reverseRedemption({ appointmentId, actor });
  }

  return NextResponse.json({ appointment: updated, redemption });
}

export async function DELETE(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { appointmentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const blocked = await paywall(user.id);
  if (blocked) return blocked;

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      branchId: true,
      dateTime: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  if (!appt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getUserBranchRole(user.id, appt.branchId);
  // Hard delete is OWNER/ADMIN only — doctors and front desk cancel instead.
  if (!can(role, "appointment.delete")) {
    return NextResponse.json(
      { error: "doctors_must_cancel_not_delete" },
      { status: 403 }
    );
  }

  const patientName = appt.patient
    ? `${appt.patient.firstName} ${appt.patient.lastName}`
    : "Unknown patient";

  // Audit BEFORE delete so we still have the appointmentId reference
  await logAppointmentEvent({
    appointmentId,
    action: "DELETE",
    actor: { id: user.id, email: user.email ?? "unknown", name: user.name ?? null },
    snapshot: { patientName, dateTime: appt.dateTime },
    changes: {},
  });

  // A package session used by this appointment goes back to the package
  // before the redemption row cascades away with it.
  await reverseRedemption({
    appointmentId,
    actor: { id: user.id, email: user.email ?? "unknown", name: user.name ?? null },
  });

  // Cascades to AppointmentReminder via Prisma onDelete: Cascade.
  await prisma.appointment.delete({ where: { id: appointmentId } });
  return NextResponse.json({ ok: true });
}
