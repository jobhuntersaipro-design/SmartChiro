import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { findConflictingAppointments } from "@/lib/appointments";

const Body = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  dateTime: z.string().datetime(),
  duration: z.number().int().positive().max(480).optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const { patientId, doctorId, dateTime, duration = 30, notes } = parsed.data;

  // Past-time guard
  const newStart = new Date(dateTime);
  if (newStart.getTime() < Date.now()) {
    return NextResponse.json({ error: "past_datetime" }, { status: 422 });
  }

  // Resolve branch from the patient
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, branchId: true },
  });
  if (!patient) {
    return NextResponse.json({ error: "patient_not_found" }, { status: 404 });
  }

  // RBAC: must be a member of the patient's branch
  const role = await getUserBranchRole(user.id, patient.branchId);
  if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // DOCTOR can only book for themselves
  if (role === "DOCTOR" && doctorId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Doctor must also be a member of the same branch
  const doctorMembership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: doctorId, branchId: patient.branchId } },
    select: { userId: true },
  });
  if (!doctorMembership) {
    return NextResponse.json({ error: "doctor_not_in_branch" }, { status: 422 });
  }

  // Conflict check
  const newEnd = new Date(newStart.getTime() + duration * 60_000);
  const conflicts = await findConflictingAppointments({
    doctorId,
    start: newStart,
    end: newEnd,
  });
  if (conflicts.length > 0) {
    return NextResponse.json(
      {
        error: "conflict",
        conflicts: conflicts.map((c) => ({
          id: c.id,
          dateTime: c.dateTime.toISOString(),
          duration: c.duration,
          patient: c.patient,
        })),
      },
      { status: 409 }
    );
  }

  const created = await prisma.appointment.create({
    data: {
      patientId,
      doctorId,
      branchId: patient.branchId,
      dateTime: newStart,
      duration,
      status: "SCHEDULED",
      notes: notes ?? null,
    },
  });

  return NextResponse.json(
    {
      appointment: {
        id: created.id,
        dateTime: created.dateTime.toISOString(),
        duration: created.duration,
        status: created.status,
        notes: created.notes,
        patientId: created.patientId,
        doctorId: created.doctorId,
        branchId: created.branchId,
      },
    },
    { status: 201 }
  );
}
