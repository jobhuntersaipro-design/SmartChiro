import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

type RouteCtx = { params: Promise<{ appointmentId: string }> };

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { appointmentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { branchId: true },
  });
  if (!appt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getUserBranchRole(user.id, appt.branchId);
  if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const reminders = await prisma.appointmentReminder.findMany({
    where: { appointmentId },
    orderBy: [{ scheduledFor: "asc" }, { channel: "asc" }],
  });
  return NextResponse.json({ reminders });
}
