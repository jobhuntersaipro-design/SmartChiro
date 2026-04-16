import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const branchId = searchParams.get("branchId");
  const userId = session.user.id;
  const branchRole = session.user.branchRole;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  let where: Record<string, unknown> = {
    dateTime: { gte: todayStart, lt: todayEnd },
  };

  if (branchRole === "DOCTOR") {
    where.doctorId = userId;
    if (session.user.activeBranchId) {
      where.branchId = session.user.activeBranchId;
    }
  } else {
    // Owner/Admin
    if (branchId && branchId !== "all") {
      where.branchId = branchId;
    } else {
      const memberships = await prisma.branchMember.findMany({
        where: { userId },
        select: { branchId: true },
      });
      where.branchId = { in: memberships.map((m) => m.branchId) };
    }
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      doctor: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { dateTime: "asc" },
    take: 10,
  });

  return NextResponse.json({
    appointments: appointments.map((appt) => ({
      id: appt.id,
      dateTime: appt.dateTime.toISOString(),
      duration: appt.duration,
      status: appt.status,
      notes: appt.notes,
      patient: appt.patient,
      doctor: { id: appt.doctor.id, name: appt.doctor.name },
      branch: appt.branch,
    })),
  });
}
