import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ patientId: string }> };

async function checkPatientAccess(userId: string, patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, branchId: true, doctorId: true },
  });

  if (!patient) return { patient: null, allowed: false };

  if (patient.doctorId === userId) return { patient, allowed: true };

  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId: patient.branchId } },
  });

  if (membership && (membership.role === "OWNER" || membership.role === "ADMIN")) {
    return { patient, allowed: true };
  }

  return { patient, allowed: false };
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patientId } = await params;
  const { patient, allowed } = await checkPatientAccess(session.user.id, patientId);

  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const upcoming = url.searchParams.get("upcoming") === "true";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10"), 50);

  const where: Record<string, unknown> = { patientId };
  if (upcoming) {
    where.dateTime = { gte: new Date() };
    where.status = { in: ["SCHEDULED", "CHECKED_IN"] };
  }

  const appointments = await prisma.appointment.findMany({
    where,
    orderBy: { dateTime: upcoming ? "asc" : "desc" },
    take: limit,
    include: {
      doctor: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    appointments: appointments.map((a) => ({
      id: a.id,
      dateTime: a.dateTime.toISOString(),
      duration: a.duration,
      status: a.status,
      notes: a.notes,
      doctor: { id: a.doctor.id, name: a.doctor.name },
    })),
  });
}
