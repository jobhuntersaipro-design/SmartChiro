import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import {
  SeriesRuleSchema,
  TreatmentTypeSchema,
  createSeriesWithAppointments,
  logSeriesCreated,
  occurrenceToJson,
  planSeries,
  resolveBookingContext,
  ruleFromInput,
  serializeSeries,
  serializeSeriesAppointment,
  seriesRuleHasEnd,
  splitOccurrences,
} from "@/lib/series-service";

const Body = SeriesRuleSchema.extend({
  patientId: z.string().min(1),
  branchId: z.string().min(1),
  doctorId: z.string().min(1),
  duration: z.number().int().positive().max(480).default(30),
  treatmentType: TreatmentTypeSchema.optional(),
  room: z.string().trim().max(60).optional(),
  notes: z.string().max(2000).optional(),
  /** Book only the dates without problems. When false, any problem → 409 `series_problems`. */
  skipProblemDates: z.boolean().default(false),
  carePlanId: z.string().min(1).optional(),
  patientPackageId: z.string().min(1).optional(),
}).refine(seriesRuleHasEnd, { message: "give a number of visits or an end date", path: ["count"] });

/** Links must belong to the same patient. */
async function linksBelongToPatient(patientId: string, carePlanId?: string, patientPackageId?: string): Promise<boolean> {
  const [plan, pkg] = await Promise.all([
    carePlanId ? prisma.carePlan.findUnique({ where: { id: carePlanId }, select: { patientId: true } }) : null,
    patientPackageId ? prisma.patientPackage.findUnique({ where: { id: patientPackageId }, select: { patientId: true } }) : null,
  ]);
  if (carePlanId && plan?.patientId !== patientId) return false;
  if (patientPackageId && pkg?.patientId !== patientId) return false;
  return true;
}

/**
 * Book a recurring series: the same checks as a single booking run for every
 * occurrence, and the valid ones are created in one transaction.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Sign in required." }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", message: "Check the repeat settings.", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const d = parsed.data;
  const context = await resolveBookingContext(user.id, d);
  if (!context.ok) return NextResponse.json({ error: context.error, message: context.message }, { status: context.status });
  if (!(await linksBelongToPatient(d.patientId, d.carePlanId, d.patientPackageId))) {
    return NextResponse.json({ error: "invalid_link", message: "Care plan or package belongs to another patient." }, { status: 422 });
  }

  const rule = ruleFromInput(d);
  const checks = await planSeries({ rule, doctorId: d.doctorId, branchId: d.branchId, duration: d.duration });
  const split = splitOccurrences(checks, d.skipProblemDates);
  if (!split.ok) return NextResponse.json(split.body, { status: split.status });

  const { series, appointments } = await prisma.$transaction((tx) =>
    createSeriesWithAppointments(tx, {
      patientId: d.patientId,
      branchId: d.branchId,
      doctorId: d.doctorId,
      treatmentType: d.treatmentType ?? null,
      duration: d.duration,
      room: d.room ?? null,
      notes: d.notes ?? null,
      rule,
      carePlanId: d.carePlanId ?? null,
      patientPackageId: d.patientPackageId ?? null,
      createdById: user.id,
      starts: split.starts,
    }),
  );

  const patient = context.ctx.patient;
  await logSeriesCreated(
    appointments,
    { id: user.id, email: user.email ?? "unknown", name: user.name ?? null },
    patient ? `${patient.firstName} ${patient.lastName}` : "Unknown patient",
  );
  const doctor = await prisma.user.findUnique({ where: { id: d.doctorId }, select: { id: true, name: true } });

  return NextResponse.json(
    {
      series: serializeSeries(series, doctor ?? { id: d.doctorId, name: null }),
      created: appointments.map(serializeSeriesAppointment),
      skipped: split.skipped.map(occurrenceToJson),
    },
    { status: 201 },
  );
}
