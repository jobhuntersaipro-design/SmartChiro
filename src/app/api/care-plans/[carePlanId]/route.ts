import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { canAccessCarePlans, loadPatientAccess } from "@/lib/package-access";
import { CARE_PLAN_INCLUDE, UpdateCarePlanSchema, serializeCarePlans } from "@/lib/care-plan-service";
import { logAppointmentEvent } from "@/lib/appointment-audit";
import { paywall } from "@/lib/paywall";
import { can } from "@/lib/permissions";

type RouteCtx = { params: Promise<{ carePlanId: string }> };

/**
 * Edit a care plan (title, goals, cadence, doctor, package link, status).
 * `cancelRemaining` with a CANCELLED / COMPLETED status also cancels the
 * plan's future booked appointments.
 */
export async function PATCH(req: Request, ctx: RouteCtx): Promise<Response> {
  const { carePlanId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Sign in required." }, { status: 401 });
  const blocked = await paywall(user.id);
  if (blocked) return blocked;

  const plan = await prisma.carePlan.findUnique({ where: { id: carePlanId }, select: { id: true, patientId: true } });
  const access = plan ? await loadPatientAccess(user.id, plan.patientId) : null;
  if (!plan || !access) return NextResponse.json({ error: "not_found", message: "Care plan not found." }, { status: 404 });
  if (!canAccessCarePlans(access)) {
    return NextResponse.json({ error: "forbidden", message: "Only the patient's doctor can change care plans." }, { status: 403 });
  }

  const parsed = UpdateCarePlanSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", message: "Check the care plan details.", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { cancelRemaining, ...d } = parsed.data;
  const linkError = await validateLinks(access.patient.id, access.patient.branchId, d.doctorId, d.patientPackageId);
  if (linkError) return NextResponse.json(linkError.body, { status: linkError.status });
  if (d.doctorId && access.role === "DOCTOR" && d.doctorId !== user.id) {
    return NextResponse.json({ error: "forbidden", message: "Doctors can't hand a plan to another doctor." }, { status: 403 });
  }

  await prisma.carePlan.update({ where: { id: carePlanId }, data: d });
  const cancelled = cancelRemaining && (d.status === "CANCELLED" || d.status === "COMPLETED")
    ? await cancelFutureAppointments(
        carePlanId,
        { id: user.id, email: user.email ?? "unknown", name: user.name ?? null },
        // A doctor cancels only their own bookings (like "this and following").
        can(access.role, "appointment.manageAll") ? null : user.id,
      )
    : 0;

  const [json] = await serializeCarePlans(await prisma.carePlan.findMany({ where: { id: carePlanId }, include: CARE_PLAN_INCLUDE }));
  return NextResponse.json({ carePlan: json, cancelledAppointments: cancelled });
}

async function validateLinks(
  patientId: string,
  branchId: string,
  doctorId: string | undefined,
  patientPackageId: string | null | undefined,
): Promise<{ status: number; body: { error: string; message: string } } | null> {
  if (doctorId) {
    const member = await prisma.branchMember.findUnique({
      where: { userId_branchId: { userId: doctorId, branchId } },
      select: { role: true },
    });
    if (!member) return { status: 422, body: { error: "doctor_not_in_branch", message: "The doctor is not a member of this branch." } };
    // Front desk don't treat patients, so a plan can't be theirs.
    if (!can(member.role, "clinical.read")) {
      return { status: 422, body: { error: "not_a_clinician", message: "Pick a doctor who treats patients." } };
    }
  }
  if (patientPackageId) {
    const pkg = await prisma.patientPackage.findUnique({ where: { id: patientPackageId }, select: { patientId: true } });
    if (pkg?.patientId !== patientId) return { status: 422, body: { error: "invalid_link", message: "That package belongs to another patient." } };
  }
  return null;
}

/** Cancel the plan's booked occurrences that haven't started yet; returns how many. */
async function cancelFutureAppointments(
  carePlanId: string,
  actor: { id: string; email: string; name: string | null },
  onlyDoctorId: string | null,
): Promise<number> {
  const targets = await prisma.appointment.findMany({
    where: {
      series: { carePlanId },
      status: { in: ["SCHEDULED", "CHECKED_IN"] },
      dateTime: { gt: new Date() },
      ...(onlyDoctorId ? { doctorId: onlyDoctorId } : {}),
    },
    select: { id: true, dateTime: true, status: true, patient: { select: { firstName: true, lastName: true } } },
  });
  if (targets.length === 0) return 0;
  const ids = targets.map((t) => t.id);
  await prisma.$transaction([
    prisma.appointment.updateMany({ where: { id: { in: ids } }, data: { status: "CANCELLED" } }),
    prisma.appointmentReminder.deleteMany({ where: { appointmentId: { in: ids }, status: "PENDING" } }),
  ]);
  await Promise.all(
    targets.map((t) =>
      logAppointmentEvent({
        appointmentId: t.id,
        action: "CANCEL",
        actor,
        snapshot: { patientName: `${t.patient.firstName} ${t.patient.lastName}`, dateTime: t.dateTime },
        changes: { status: { from: t.status, to: "CANCELLED" } },
      }),
    ),
  );
  return targets.length;
}
