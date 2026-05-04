import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

type RouteCtx = { params: Promise<{ appointmentId: string }> };

const Body = z
  .object({
    dateTime: z.string().datetime().optional(),
    status: z
      .enum(["SCHEDULED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"])
      .optional(),
    duration: z.number().int().positive().optional(),
    notes: z.string().nullable().optional(),
    doctorId: z.string().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "at least one field required");

export async function PATCH(req: Request, ctx: RouteCtx): Promise<Response> {
  const { appointmentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { branchId: true, doctorId: true, dateTime: true, status: true },
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

  const updateData: Record<string, unknown> = {};
  if (parsed.data.dateTime !== undefined) updateData.dateTime = new Date(parsed.data.dateTime);
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.duration !== undefined) updateData.duration = parsed.data.duration;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.doctorId !== undefined) updateData.doctorId = parsed.data.doctorId;

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: updateData,
  });

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
