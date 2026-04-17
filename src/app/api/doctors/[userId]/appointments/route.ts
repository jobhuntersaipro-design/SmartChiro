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
  const dateParam = searchParams.get("date");

  // Determine target date (default: today)
  let targetDate: Date;
  if (!dateParam || dateParam === "today") {
    targetDate = new Date();
  } else {
    targetDate = new Date(dateParam);
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
  }

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

  // Build date range for the target day
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId: userId,
      dateTime: { gte: dayStart, lte: dayEnd },
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { dateTime: "asc" },
  });

  return NextResponse.json({
    appointments: appointments.map((a) => ({
      id: a.id,
      dateTime: a.dateTime.toISOString(),
      duration: a.duration,
      status: a.status,
      notes: a.notes,
      patient: a.patient
        ? { id: a.patient.id, firstName: a.patient.firstName, lastName: a.patient.lastName }
        : null,
      branch: a.branch
        ? { id: a.branch.id, name: a.branch.name }
        : null,
    })),
  });
}
