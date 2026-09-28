import { NextResponse } from "next/server";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { canAccessCarePlans, canSellPackages, loadPatientAccess, type PatientAccess } from "@/lib/package-access";
import { resolveSaleSource, sellPackage, serializePatientPackage, userNamesFor, type SaleSource } from "@/lib/package-service";
import { CARE_PLAN_INCLUDE, CreateCarePlanSchema, serializeCarePlans } from "@/lib/care-plan-service";
import {
  createSeriesWithAppointments,
  logSeriesCreated,
  occurrenceToJson,
  planSeries,
  resolveBookingContext,
  ruleFromInput,
  serializeSeries,
  serializeSeriesAppointment,
  splitOccurrences,
} from "@/lib/series-service";
import { clinicInstantFromInputs } from "@/lib/clinic-time";
import type { SeriesRule } from "@/lib/series";

type RouteCtx = { params: Promise<{ patientId: string }> };
type Body = z.infer<typeof CreateCarePlanSchema>;
type ErrorOut = { status: number; error: string; message: string; extra?: Record<string, unknown> };

const err = (e: ErrorOut) => NextResponse.json({ error: e.error, message: e.message, ...e.extra }, { status: e.status });

/** Care plans are clinical: OWNER/ADMIN and the patient's own doctor. 404 outside the branch. */
async function authorize(patientId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, res: err({ status: 401, error: "unauthorized", message: "Sign in required." }) } as const;
  const access = await loadPatientAccess(user.id, patientId);
  if (!access) return { ok: false, res: err({ status: 404, error: "not_found", message: "Patient not found." }) } as const;
  // TODO(front-desk): FRONT_DESK must get 403 here (care plans are clinical).
  if (!canAccessCarePlans(access)) {
    return { ok: false, res: err({ status: 403, error: "forbidden", message: "Only the patient's doctor can see care plans." }) } as const;
  }
  return { ok: true, user, access } as const;
}

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { patientId } = await ctx.params;
  const auth = await authorize(patientId);
  if (!auth.ok) return auth.res;
  const rows = await prisma.carePlan.findMany({
    where: { patientId },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    include: CARE_PLAN_INCLUDE,
  });
  return NextResponse.json({ carePlans: await serializeCarePlans(rows) });
}

interface Prepared {
  doctorId: string;
  sale: SaleSource | null;
  series: { rule: SeriesRule; starts: Date[]; skipped: ReturnType<typeof occurrenceToJson>[] } | null;
}

/** Validates doctor, package and repeat rule before anything is written. */
async function prepare(userId: string, access: PatientAccess, d: Body): Promise<Prepared | ErrorOut> {
  const { patient } = access;
  const doctorId = d.doctorId ?? (access.role === "DOCTOR" ? userId : patient.doctorId);
  const booking = await resolveBookingContext(userId, { branchId: patient.branchId, doctorId, patientId: patient.id });
  if (!booking.ok) return booking;

  let sale: SaleSource | null = null;
  if (d.packageTemplateId) {
    // TODO(front-desk): FRONT_DESK may sell, but can't create care plans at all.
    if (!canSellPackages(access.role)) return { status: 403, error: "forbidden_sell", message: "Only owners and admins sell packages." };
    sale = await resolveSaleSource({ templateId: d.packageTemplateId }, patient.branchId);
    if (!sale) return { status: 404, error: "template_not_found", message: "That package is not on sale in this branch." };
  }
  if (d.patientPackageId) {
    const pkg = await prisma.patientPackage.findUnique({ where: { id: d.patientPackageId }, select: { patientId: true } });
    if (pkg?.patientId !== patient.id) return { status: 422, error: "invalid_link", message: "That package belongs to another patient." };
  }
  if (!d.series) return { doctorId, sale, series: null };

  const s = d.series;
  const rule = ruleFromInput({ ...s, startDate: s.startDate ?? d.startDate, count: s.count ?? (s.until ? undefined : d.totalVisits) });
  const checks = await planSeries({ rule, doctorId, branchId: patient.branchId, duration: s.duration });
  const split = splitOccurrences(checks, s.skipProblemDates);
  if (!split.ok) {
    const { error, message, ...extra } = split.body as { error: string; message: string };
    return { status: split.status, error, message, extra };
  }
  return { doctorId, sale, series: { rule, starts: split.starts, skipped: split.skipped.map(occurrenceToJson) } };
}

/**
 * Create a care plan. Optional `packageTemplateId` sells a package and
 * optional `series` books the visits — all in one transaction.
 */
export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const { patientId } = await ctx.params;
  const auth = await authorize(patientId);
  if (!auth.ok) return auth.res;
  const { user, access } = auth;

  const parsed = CreateCarePlanSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", message: "Check the care plan details.", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const d = parsed.data;
  const prep = await prepare(user.id, access, d);
  if ("status" in prep) return err(prep);

  const { patient } = access;
  const s = d.series;
  const result = await prisma.$transaction(async (tx) => {
    const sold = prep.sale ? await sellPackage(tx, { ...prep.sale, patientId, branchId: patient.branchId, soldById: user.id }) : null;
    const packageId = sold?.id ?? d.patientPackageId ?? null;
    const plan = await tx.carePlan.create({
      data: {
        patientId,
        branchId: patient.branchId,
        doctorId: prep.doctorId,
        title: d.title,
        visitsPerWeek: d.visitsPerWeek,
        totalVisits: d.totalVisits,
        startDate: clinicInstantFromInputs(d.startDate),
        goals: d.goals ?? null,
        patientPackageId: packageId,
      },
    });
    const booked = prep.series && s
      ? await createSeriesWithAppointments(tx, {
          patientId,
          branchId: patient.branchId,
          doctorId: prep.doctorId,
          // A package limited to some treatments redeems only those — default the visits to its first one.
          treatmentType: s.treatmentType ?? prep.sale?.treatmentTypes[0] ?? null,
          duration: s.duration,
          room: s.room ?? null,
          notes: s.notes ?? null,
          rule: prep.series.rule,
          carePlanId: plan.id,
          patientPackageId: packageId,
          createdById: user.id,
          starts: prep.series.starts,
        })
      : null;
    return { sold, plan, booked };
  });

  const actor = { id: user.id, email: user.email ?? "unknown", name: user.name ?? null };
  if (result.booked) await logSeriesCreated(result.booked.appointments, actor, `${patient.firstName} ${patient.lastName}`);
  const [plan] = await serializeCarePlans(
    await prisma.carePlan.findMany({ where: { id: result.plan.id }, include: CARE_PLAN_INCLUDE }),
  );
  const doctor = { id: prep.doctorId, name: plan.doctor.name };
  return NextResponse.json(
    {
      carePlan: plan,
      package: result.sold ? serializePatientPackage(result.sold, await userNamesFor([result.sold])) : null,
      series: result.booked
        ? {
            series: serializeSeries(result.booked.series, doctor),
            created: result.booked.appointments.map(serializeSeriesAppointment),
            skipped: prep.series?.skipped ?? [],
          }
        : null,
    },
    { status: 201 },
  );
}
