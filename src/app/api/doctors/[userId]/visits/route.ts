import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const { searchParams } = req.nextUrl;
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "5", 10)));

  // Verify target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, branchMemberships: { select: { branchId: true } } },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Caller must share at least one branch with target
  if (session.user.id !== userId) {
    const callerBranches = await prisma.branchMember.findMany({
      where: { userId: session.user.id },
      select: { branchId: true },
    });
    const callerBranchIds = new Set(callerBranches.map((m) => m.branchId));
    const shared = targetUser.branchMemberships.some((m) =>
      callerBranchIds.has(m.branchId)
    );
    if (!shared) {
      return NextResponse.json({ error: "Forbidden: no shared branch" }, { status: 403 });
    }
  }

  const visits = await prisma.visit.findMany({
    where: { doctorId: userId },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { visitDate: "desc" },
    take: limit,
  });

  return NextResponse.json({
    visits: visits.map((v) => ({
      id: v.id,
      visitDate: v.visitDate.toISOString(),
      subjective: v.subjective,
      assessment: v.assessment,
      patient: v.patient
        ? { id: v.patient.id, firstName: v.patient.firstName, lastName: v.patient.lastName }
        : null,
    })),
  });
}
