import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { findConflictingAppointments } from "@/lib/appointments";
import { logAppointmentEvent, diffSnapshots, snapshotOf, classifyUpdate } from "@/lib/appointment-audit";

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
      branchId: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      doctor: { select: { id: true, name: true } },
    },
  });
  if (!appt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getUserBranchRole(user.id, appt.branchId);
  if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({
    appointment: {
      id: appt.id,
      dateTime: appt.dateTime.toISOString(),
      duration: appt.duration,
      status: appt.status,
      notes: appt.notes,
      branchId: appt.branchId,
      patient: appt.patient,
      doctor: appt.doctor,
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
  })
  .refine((d) => Object.keys(d).length > 0, "at least one field required");

export async function PATCH(req: Request, ctx: RouteCtx): Promise<Response> {
  const { appointmentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  if (!appt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getUserBranchRole(user.id, appt.branchId);
  if (role !== "OWNER" && role !== "ADMIN" && appt.doctorId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const isPast = appt.dateTime.getTime() < Date.now();

  // DOCTOR (not OWNER/ADMIN) cannot edit a past appointment at all.
  if (isPast && role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden_past_edit" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 }
    );
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
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.dateTime !== undefined) updateData.dateTime = new Date(parsed.data.dateTime);
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.duration !== undefined) updateData.duration = parsed.data.duration;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.doctorId !== undefined) updateData.doctorId = parsed.data.doctorId;
  if (parsed.data.treatmentType !== undefined) updateData.treatmentType = parsed.data.treatmentType;

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
  });
  const after = snapshotOf({
    dateTime: updated.dateTime,
    duration: updated.duration,
    status: updated.status,
    notes: updated.notes,
    doctorId: updated.doctorId,
    treatmentType: updated.treatmentType,
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

  return NextResponse.json({ appointment: updated });
}

export async function DELETE(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { appointmentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
  if (role !== "OWNER" && role !== "ADMIN") {
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

  // Cascades to AppointmentReminder via Prisma onDelete: Cascade.
  await prisma.appointment.delete({ where: { id: appointmentId } });
  return NextResponse.json({ ok: true });
}
