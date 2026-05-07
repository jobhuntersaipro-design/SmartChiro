import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

type RouteCtx = { params: Promise<{ userId: string; timeOffId: string }> };

async function authorizeDoctorAccess(callerId: string, doctorId: string): Promise<"OWNER" | "ADMIN" | "DOCTOR" | null> {
  if (callerId === doctorId) return "DOCTOR";
  const sharedBranches = await prisma.branchMember.findMany({
    where: { userId: doctorId },
    select: { branchId: true },
  });
  if (sharedBranches.length === 0) return null;
  const callerMembership = await prisma.branchMember.findFirst({
    where: {
      userId: callerId,
      branchId: { in: sharedBranches.map((b) => b.branchId) },
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: { role: true },
  });
  return callerMembership?.role ?? null;
}

export async function DELETE(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { userId, timeOffId } = await ctx.params;
  const caller = await getCurrentUser();
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const role = await authorizeDoctorAccess(caller.id, userId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (role === "DOCTOR" && caller.id !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const row = await prisma.doctorTimeOff.findUnique({ where: { id: timeOffId } });
  if (!row || row.userId !== userId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.doctorTimeOff.delete({ where: { id: timeOffId } });
  return NextResponse.json({ ok: true });
}
