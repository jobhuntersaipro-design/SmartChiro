import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { canEditDoctorLeave } from "@/lib/auth/doctor-access";
import { paywall } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ userId: string; timeOffId: string }> };

export async function DELETE(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { userId, timeOffId } = await ctx.params;
  const caller = await getCurrentUser();
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const blocked = await paywall(caller.id);
  if (blocked) return blocked;

  const row = await prisma.doctorTimeOff.findUnique({ where: { id: timeOffId } });
  if (!row || row.userId !== userId || !(await canEditDoctorLeave(caller.id, userId, row.branchId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.doctorTimeOff.delete({ where: { id: timeOffId } });
  return NextResponse.json({ ok: true });
}
