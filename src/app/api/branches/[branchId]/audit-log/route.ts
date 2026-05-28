import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ branchId: string }> };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId } = await params;

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true },
  });

  // Branch no longer exists → 404 unconditionally. The previous behavior of
  // allowing audit-log access for callers who authored rows acted as a
  // timing-attack oracle: someone evicted from a branch could probe whether
  // a branch ID had ever existed in the audit log. Audit history for deleted
  // branches should be reachable only via a future ADMIN-scoped route.
  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }
  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId } },
  });
  if (!membership) {
    // Match existing pattern: cross-branch leak returns 404, not 403
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }
  if (membership.role === "DOCTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limitParam = parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isNaN(limitParam)
    ? DEFAULT_LIMIT
    : Math.min(Math.max(limitParam, 1), MAX_LIMIT);

  const cursor = req.nextUrl.searchParams.get("cursor");

  const entries = await prisma.branchAuditLog.findMany({
    where: { branchId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = entries.length > limit;
  const page = hasMore ? entries.slice(0, limit) : entries;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return NextResponse.json({
    entries: page.map((e) => ({
      id: e.id,
      action: e.action,
      actorId: e.actorId,
      actorEmail: e.actorEmail,
      actorName: e.actorName,
      branchNameAtEvent: e.branchNameAtEvent,
      changes: e.changes,
      createdAt: e.createdAt.toISOString(),
    })),
    nextCursor,
  });
}
