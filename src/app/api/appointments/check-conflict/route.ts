import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-utils";
import { findConflictingAppointments } from "@/lib/appointments";

const Query = z.object({
  doctorId: z.string().min(1),
  dateTime: z.string().datetime(),
  duration: z.coerce.number().int().positive().max(480),
  excludeId: z.string().optional(),
});

export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const parsed = Query.safeParse({
    doctorId: sp.get("doctorId"),
    dateTime: sp.get("dateTime"),
    duration: sp.get("duration"),
    excludeId: sp.get("excludeId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const { doctorId, dateTime, duration, excludeId } = parsed.data;

  const start = new Date(dateTime);
  const end = new Date(start.getTime() + duration * 60_000);

  const conflicts = await findConflictingAppointments({
    doctorId,
    start,
    end,
    excludeId,
  });

  return NextResponse.json({
    conflicts: conflicts.map((c) => ({
      id: c.id,
      dateTime: c.dateTime.toISOString(),
      duration: c.duration,
      patient: c.patient,
    })),
  });
}
