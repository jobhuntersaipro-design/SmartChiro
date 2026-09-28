import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { can } from "@/lib/permissions";
import { OUTREACH_LOG_SELECT } from "@/lib/outreach/dispatcher";
import { toLogItems } from "@/lib/outreach/log";

type RouteCtx = { params: Promise<{ branchId: string }> };

const MAX_LIMIT = 100;

/** Branch outreach log: the latest recall / review requests (newest first). */
export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (!can(role, "reminders.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const raw = Number(new URL(req.url).searchParams.get("limit") ?? MAX_LIMIT);
  const limit = Number.isFinite(raw) ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(raw))) : MAX_LIMIT;

  const rows = await prisma.patientOutreach.findMany({
    where: { branchId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { ...OUTREACH_LOG_SELECT, patient: { select: { id: true, firstName: true, lastName: true } } },
  });
  return NextResponse.json({ items: await toLogItems(rows) });
}
