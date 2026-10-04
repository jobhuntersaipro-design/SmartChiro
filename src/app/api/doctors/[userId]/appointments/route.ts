import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { doctorRecordBranches } from "@/lib/auth/doctor-access";
import { clinicCalendar } from "@/lib/clinic-time";

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

  const branchIds = await doctorRecordBranches(session.user.id, userId, ["patient.readAll"]);
  if (!branchIds) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (branchIds.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The clinic day containing the target date (the server runs in UTC).
  const cal = clinicCalendar(targetDate);
  const dayStart = cal.dayStart;
  const dayEnd = new Date(cal.dayEnd.getTime() - 1);

  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId: userId,
      branchId: { in: branchIds },
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
