import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { logoutSession } from "@/lib/wa/worker-client";

type RouteCtx = { params: Promise<{ branchId: string }> };

export async function POST(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await logoutSession(branchId);
  await prisma.waSession.upsert({
    where: { branchId },
    create: { branchId, status: "DISCONNECTED" },
    update: { status: "DISCONNECTED", phoneNumber: null, qrPayload: null },
  });
  return NextResponse.json({ ok: true });
}
