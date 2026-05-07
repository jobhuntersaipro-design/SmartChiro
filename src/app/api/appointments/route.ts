import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { findConflictingAppointments } from "@/lib/appointments";
import { overlapsBreak } from "@/lib/availability";
import { logAppointmentEvent } from "@/lib/appointment-audit";
import { sendDoctorBookingNotification } from "@/lib/email";
import { treatmentLabelFor } from "@/lib/treatment-colors";

const TREATMENT_TYPES = [
  "INITIAL_CONSULT",
  "ADJUSTMENT",
  "GONSTEAD",
  "DIVERSIFIED",
  "ACTIVATOR",
  "DROP_TABLE",
  "SOFT_TISSUE",
  "SPINAL_DECOMPRESSION",
  "REHAB_EXERCISE",
  "X_RAY",
  "FOLLOW_UP",
  "WELLNESS_CHECK",
  "PEDIATRIC",
  "PRENATAL",
  "SPORTS_REHAB",
  "OTHER",
] as const;

const MAX_EVENTS_PER_QUERY = 500;

export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const branchId = url.searchParams.get("branchId");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  if (!branchId || !start || !end) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  // RBAC: caller must be a member of the branch. Cross-branch leak → 404.
  const role = await getUserBranchRole(user.id, branchId);
  if (!role) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const doctorIdsParam = url.searchParams.get("doctorIds");
  const doctorIds = doctorIdsParam ? doctorIdsParam.split(",").filter(Boolean) : null;
  const includeCancelled = url.searchParams.get("includeCancelled") === "true";
  const tab = url.searchParams.get("tab");

  // `tab` overrides the default cancel-exclusion when set.
  // - completed/cancelled/noshow: explicit single-status filters
  // - today: SCHEDULED+CHECKED_IN+IN_PROGRESS within today's bounds
  // - upcoming: any non-terminal status, server time forward
  type ApptStatus =
    | "SCHEDULED"
    | "CHECKED_IN"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "CANCELLED"
    | "NO_SHOW";
  let statusFilter: { in?: ApptStatus[]; notIn?: ApptStatus[]; equals?: ApptStatus } | undefined =
    includeCancelled
      ? undefined
      : { notIn: ["CANCELLED", "NO_SHOW"] };
  let dateFilter: { gte?: Date; lt?: Date; gt?: Date } = { gte: startDate, lt: endDate };

  if (tab === "completed") {
    statusFilter = { equals: "COMPLETED" };
  } else if (tab === "cancelled") {
    statusFilter = { equals: "CANCELLED" };
  } else if (tab === "noshow") {
    statusFilter = { equals: "NO_SHOW" };
  } else if (tab === "today") {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    dateFilter = { gte: dayStart, lt: dayEnd };
    statusFilter = { in: ["SCHEDULED", "CHECKED_IN", "IN_PROGRESS"] };
  } else if (tab === "upcoming") {
    dateFilter = { gt: new Date() };
    statusFilter = { in: ["SCHEDULED", "CHECKED_IN", "IN_PROGRESS"] };
  }

  // First check the count to enforce the 500-event cap.
  const count = await prisma.appointment.count({
    where: {
      branchId,
      dateTime: dateFilter,
      ...(doctorIds ? { doctorId: { in: doctorIds } } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    },
  });
  if (count > MAX_EVENTS_PER_QUERY) {
    return NextResponse.json(
      { error: "window_too_wide", count, cap: MAX_EVENTS_PER_QUERY },
      { status: 422 }
    );
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      branchId,
      dateTime: dateFilter,
      ...(doctorIds ? { doctorId: { in: doctorIds } } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: { dateTime: "asc" },
    select: {
      id: true,
      dateTime: true,
      duration: true,
      status: true,
      notes: true,
      treatmentType: true,
      patient: {
        select: { id: true, firstName: true, lastName: true, phone: true },
      },
      doctor: {
        select: { id: true, name: true, image: true },
      },
      branch: { select: { id: true, name: true } },
      invoices: {
        where: { status: { in: ["DRAFT", "SENT", "OVERDUE"] } },
        select: { id: true },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    appointments: appointments.map((a) => ({
      id: a.id,
      dateTime: a.dateTime.toISOString(),
      duration: a.duration,
      status: a.status,
      notes: a.notes,
      treatmentType: a.treatmentType,
      hasUnpaidInvoice: a.invoices.length > 0,
      patient: a.patient,
      doctor: a.doctor,
      branch: a.branch,
    })),
  });
}

const Body = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  dateTime: z.string().datetime(),
  duration: z.number().int().positive().max(480).optional(),
  notes: z.string().optional(),
  treatmentType: z.enum(TREATMENT_TYPES).optional(),
  /** Bypass the break-time confirmation gate. Frontend sets this on retry after the user clicks "Book on break" in the dialog. */
  forceBookOnBreak: z.boolean().optional(),
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
  const { patientId, doctorId, dateTime, duration = 30, notes, treatmentType, forceBookOnBreak } = parsed.data;

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

  // Break-time confirmation gate. If the chosen slot overlaps the doctor's break,
  // require the client to retry with `forceBookOnBreak: true` after showing a confirm dialog.
  if (!forceBookOnBreak) {
    const docBreaks = await prisma.doctorBreakTime.findMany({
      where: { userId: doctorId, branchId: patient.branchId },
      select: { userId: true, branchId: true, dayOfWeek: true, startMinute: true, endMinute: true, label: true },
    });
    if (overlapsBreak(doctorId, newStart, newEnd, docBreaks)) {
      return NextResponse.json(
        {
          error: "break_time_confirm_required",
          breakLabel:
            docBreaks.find((b) => b.dayOfWeek === newStart.getDay())?.label ?? "Break time",
        },
        { status: 409 }
      );
    }
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
      treatmentType: treatmentType ?? null,
    },
  });

  // Hydrate names for audit + email — use what we already have without an extra query
  const [patientFull, doctorFull, branchFull] = await Promise.all([
    prisma.patient.findUnique({
      where: { id: patientId },
      select: { firstName: true, lastName: true },
    }),
    prisma.user.findUnique({
      where: { id: doctorId },
      select: { id: true, name: true, email: true },
    }),
    prisma.branch.findUnique({
      where: { id: patient.branchId },
      select: { name: true },
    }),
  ]);
  const patientName = patientFull
    ? `${patientFull.firstName} ${patientFull.lastName}`
    : "Unknown patient";

  // Audit log — fail-soft
  await logAppointmentEvent({
    appointmentId: created.id,
    action: "CREATE",
    actor: { id: user.id, email: user.email ?? "unknown", name: user.name ?? null },
    snapshot: { patientName, dateTime: created.dateTime },
    changes: {
      dateTime: { from: null, to: created.dateTime.toISOString() },
      doctorId: { from: null, to: created.doctorId },
      duration: { from: null, to: created.duration },
      status: { from: null, to: created.status },
      treatmentType: { from: null, to: created.treatmentType ?? null },
      notes: { from: null, to: created.notes ?? null },
    },
  });

  // Notify the doctor — only if they are not the booker (no point emailing yourself)
  if (doctorFull?.email && doctorFull.id !== user.id) {
    void sendDoctorBookingNotification({
      to: doctorFull.email,
      doctorName: doctorFull.name ?? null,
      patientName,
      dateTime: created.dateTime,
      duration: created.duration,
      branchName: branchFull?.name ?? "Your branch",
      treatmentLabel: created.treatmentType ? treatmentLabelFor(created.treatmentType) : null,
      bookedByName: user.name ?? user.email ?? null,
      appointmentUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/appointments?appointment=${created.id}`,
    });
  }

  return NextResponse.json(
    {
      appointment: {
        id: created.id,
        dateTime: created.dateTime.toISOString(),
        duration: created.duration,
        status: created.status,
        notes: created.notes,
        treatmentType: created.treatmentType,
        patientId: created.patientId,
        doctorId: created.doctorId,
        branchId: created.branchId,
      },
    },
    { status: 201 }
  );
}
