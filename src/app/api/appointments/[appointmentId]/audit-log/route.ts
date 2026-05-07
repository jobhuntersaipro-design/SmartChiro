import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

type RouteCtx = { params: Promise<{ appointmentId: string }> };

const MAX_LIMIT = 100;

export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  const { appointmentId } = await ctx.params;
  const caller = await getCurrentUser();
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Look up the appointment to find its branch — needed for cross-branch leak check.
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { branchId: true },
  });
  if (!appt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getUserBranchRole(caller.id, appt.branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = new URL(req.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
  const limit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT);
  const cursor = url.searchParams.get("cursor");

  const rows = await prisma.appointmentAuditLog.findMany({
    where: { appointmentId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  const nextCursor = rows.length > limit ? rows[limit - 1].id : null;
  const trimmed = rows.slice(0, limit);

  return NextResponse.json({
    entries: trimmed.map((r) => ({
      id: r.id,
      action: r.action,
      actorId: r.actorId,
      actorEmail: r.actorEmail,
      actorName: r.actorName,
      patientNameAtEvent: r.patientNameAtEvent,
      dateTimeAtEvent: r.dateTimeAtEvent.toISOString(),
      changes: r.changes,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor,
  });
}
