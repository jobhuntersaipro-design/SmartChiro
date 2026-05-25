import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
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

  // RBAC: caller must share at least one branch with the target doctor.
  // Return 404 on miss to avoid doctor-id enumeration via the patient names
  // exposed in conflict responses.
  const doctorBranchIds = await prisma.branchMember
    .findMany({ where: { userId: doctorId }, select: { branchId: true } })
    .then((rows) => rows.map((r) => r.branchId));
  if (doctorBranchIds.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const sharesBranch = await prisma.branchMember.count({
    where: { userId: user.id, branchId: { in: doctorBranchIds } },
  });
  if (sharesBranch === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

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
