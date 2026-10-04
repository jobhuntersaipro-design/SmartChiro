import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clinicCalendar } from "@/lib/clinic-time";
import { dashboardScope } from "@/lib/branch-context";
import { scopedWhere } from "@/lib/branch-scope";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const branchId = searchParams.get("branchId");
  const userId = session.user.id;
  const scope = await dashboardScope(userId, branchId);
  if (!scope) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  const { dayStart: todayStart, dayEnd: todayEnd } = clinicCalendar(new Date());
  // Doctors see their own appointments in the branches where they're a
  // doctor, everyone else the whole branch — by the role in each branch.
  const where = { ...scopedWhere(scope, userId), dateTime: { gte: todayStart, lt: todayEnd } };

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
