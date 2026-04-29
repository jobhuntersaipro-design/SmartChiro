import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { startSession } from "@/lib/wa/worker-client";

type RouteCtx = { params: Promise<{ branchId: string }> };

export async function POST(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await startSession(branchId);
  if (!result.ok) {
    return NextResponse.json({ error: "worker_unavailable" }, { status: 502 });
  }

  await prisma.waSession.upsert({
    where: { branchId },
    create: { branchId, status: "PAIRING" },
    update: { status: "PAIRING", qrPayload: null },
  });
  return NextResponse.json({ status: "PAIRING" });
}
