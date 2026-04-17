import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DOCTOR_COLORS = [
  "#533afd", "#0570DE", "#30B130", "#DF1B41", "#F5A623",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#6366F1",
];

type RouteContext = { params: Promise<{ branchId: string }> };

export async function GET(
  req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId } = await params;
  const { searchParams } = req.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const doctorId = searchParams.get("doctorId");

  if (!start || !end) {
    return NextResponse.json({ error: "start and end query params required" }, { status: 400 });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  // Check membership
  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get branch for operating hours
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { operatingHours: true },
  });

  // Get doctors in this branch
  const members = await prisma.branchMember.findMany({
    where: { branchId },
    include: {
      user: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  // Get appointments in range
  const whereClause: Record<string, unknown> = {
    branchId,
    dateTime: { gte: startDate, lt: endDate },
  };
  if (doctorId) {
    whereClause.doctorId = doctorId;
  }

  const appointments = await prisma.appointment.findMany({
    where: whereClause,
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      doctor: { select: { id: true, name: true } },
    },
    orderBy: { dateTime: "asc" },
  });

  // Assign colors to doctors
  const doctors = members.map((m, i) => ({
    id: m.user.id,
    name: m.user.name,
    image: m.user.image,
    color: DOCTOR_COLORS[i % DOCTOR_COLORS.length],
  }));

  return NextResponse.json({
    appointments: appointments.map((a) => ({
      id: a.id,
      dateTime: a.dateTime.toISOString(),
      duration: a.duration,
      status: a.status,
      patient: a.patient
        ? { id: a.patient.id, firstName: a.patient.firstName, lastName: a.patient.lastName }
        : null,
      doctor: a.doctor
        ? { id: a.doctor.id, name: a.doctor.name }
        : null,
      notes: a.notes,
    })),
    doctors,
    operatingHours: branch?.operatingHours ?? null,
  });
}
