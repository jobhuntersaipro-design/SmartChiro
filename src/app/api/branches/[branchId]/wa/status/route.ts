import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { can } from "@/lib/permissions";

type RouteCtx = { params: Promise<{ branchId: string }> };

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (!can(role, "reminders.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const row = await prisma.waSession.findUnique({ where: { branchId } });
  return NextResponse.json(
    row ?? {
      branchId,
      status: "DISCONNECTED",
      phoneNumber: null,
      lastSeenAt: null,
      qrPayload: null,
    }
  );
}
