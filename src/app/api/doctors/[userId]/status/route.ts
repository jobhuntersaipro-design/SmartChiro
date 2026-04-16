import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ userId: string }> };

// ─── PATCH /api/doctors/[userId]/status ───
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  // Cannot toggle own status
  if (session.user.id === userId) {
    return NextResponse.json(
      { error: "Cannot toggle your own status" },
      { status: 403 }
    );
  }

  // Target must exist
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { branchMemberships: { select: { branchId: true } } },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Caller must be OWNER/ADMIN of a shared branch
  const callerMemberships = await prisma.branchMember.findMany({
    where: { userId: session.user.id },
    select: { branchId: true, role: true },
  });
  const targetBranchIds = new Set(
    targetUser.branchMemberships.map((m) => m.branchId)
  );
  const isOwnerOrAdmin = callerMemberships.some(
    (m) =>
      targetBranchIds.has(m.branchId) &&
      (m.role === "OWNER" || m.role === "ADMIN")
  );
  if (!isOwnerOrAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (typeof body.isActive !== "boolean") {
    return NextResponse.json(
      { error: "isActive must be a boolean" },
      { status: 400 }
    );
  }

  try {
    const profile = await prisma.doctorProfile.upsert({
      where: { userId },
      create: { userId, isActive: body.isActive },
      update: { isActive: body.isActive },
    });

    return NextResponse.json({ isActive: profile.isActive }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/doctors/[userId]/status error:", error);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}
