import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clinicDateKey } from "@/lib/clinic-time";
import { effectiveStatus, sessionsLeft } from "@/lib/packages";
import { IsoDateSchema, SeriesRuleSchema, TreatmentTypeSchema } from "@/lib/series-service";
import type { CarePlanJson, CarePlanProgressJson } from "@/types/packages";

/** Care plans (Phase 3, clinical): schemas and serialisation with visit progress. */

/** `series` inside POST /api/patients/[patientId]/care-plans — startDate defaults to the plan's, count to totalVisits. */
export const CarePlanSeriesSchema = SeriesRuleSchema.extend({
  startDate: IsoDateSchema.optional(),
  duration: z.number().int().positive().max(480).default(30),
  treatmentType: TreatmentTypeSchema.optional(),
  room: z.string().trim().max(60).optional(),
  notes: z.string().max(2000).optional(),
  skipProblemDates: z.boolean().default(false),
});

export const CreateCarePlanSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    doctorId: z.string().min(1).optional(),
    visitsPerWeek: z.number().int().min(1).max(7),
    totalVisits: z.number().int().min(1).max(200),
    startDate: IsoDateSchema,
    goals: z.string().trim().max(4000).optional(),
    /** Sell this catalogue package with the plan (OWNER/ADMIN). */
    packageTemplateId: z.string().min(1).optional(),
    /** Or link a package the patient already has. */
    patientPackageId: z.string().min(1).optional(),
    series: CarePlanSeriesSchema.optional(),
  })
  .refine((d) => !(d.packageTemplateId && d.patientPackageId), {
    message: "sell a package or link an existing one, not both",
    path: ["patientPackageId"],
  });

export const UpdateCarePlanSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    goals: z.string().trim().max(4000).nullable().optional(),
    visitsPerWeek: z.number().int().min(1).max(7).optional(),
    totalVisits: z.number().int().min(1).max(200).optional(),
    doctorId: z.string().min(1).optional(),
    status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
    patientPackageId: z.string().min(1).nullable().optional(),
    /** With status CANCELLED/COMPLETED: also cancel the plan's future booked appointments. */
    cancelRemaining: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).some((k) => k !== "cancelRemaining"), "nothing to change");

export const CARE_PLAN_INCLUDE = {
  doctor: { select: { id: true, name: true } },
  series: { select: { id: true }, orderBy: { createdAt: "asc" } },
  patientPackage: {
    select: { id: true, name: true, sessionsTotal: true, sessionsUsed: true, status: true, expiresAt: true },
  },
} satisfies Prisma.CarePlanInclude;

type CarePlanRow = Prisma.CarePlanGetPayload<{ include: typeof CARE_PLAN_INCLUDE }>;

const UPCOMING = new Set(["SCHEDULED", "CHECKED_IN", "IN_PROGRESS"]);

/** Serialise plans with progress counted from their series' appointments (one grouped query). */
export async function serializeCarePlans(rows: CarePlanRow[], now: Date = new Date()): Promise<CarePlanJson[]> {
  const seriesToPlan = new Map<string, string>();
  for (const r of rows) for (const s of r.series) seriesToPlan.set(s.id, r.id);
  const groups = seriesToPlan.size
    ? await prisma.appointment.groupBy({
        by: ["seriesId", "status"],
        where: { seriesId: { in: [...seriesToPlan.keys()] } },
        _count: { _all: true },
      })
    : [];
  const progress = new Map<string, CarePlanProgressJson>();
  for (const r of rows) progress.set(r.id, { completed: 0, upcoming: 0, cancelled: 0, noShow: 0, planned: r.totalVisits });
  for (const g of groups) {
    const p = g.seriesId ? progress.get(seriesToPlan.get(g.seriesId) ?? "") : undefined;
    if (!p) continue;
    const n = g._count._all;
    if (g.status === "COMPLETED") p.completed += n;
    else if (g.status === "CANCELLED") p.cancelled += n;
    else if (g.status === "NO_SHOW") p.noShow += n;
    else if (UPCOMING.has(g.status)) p.upcoming += n;
  }
  return rows.map((r) => serializeCarePlan(r, progress.get(r.id)!, now));
}

function serializeCarePlan(r: CarePlanRow, progress: CarePlanProgressJson, now: Date): CarePlanJson {
  const pkg = r.patientPackage;
  return {
    id: r.id,
    patientId: r.patientId,
    branchId: r.branchId,
    doctor: r.doctor,
    title: r.title,
    visitsPerWeek: r.visitsPerWeek,
    totalVisits: r.totalVisits,
    startDate: clinicDateKey(r.startDate),
    goals: r.goals,
    status: r.status,
    patientPackageId: r.patientPackageId,
    package: pkg
      ? {
          id: pkg.id,
          name: pkg.name,
          sessionsTotal: pkg.sessionsTotal,
          sessionsUsed: pkg.sessionsUsed,
          sessionsLeft: sessionsLeft(pkg),
          effectiveStatus: effectiveStatus(pkg, now),
          expiresAt: pkg.expiresAt?.toISOString() ?? null,
        }
      : null,
    seriesIds: r.series.map((s) => s.id),
    progress,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
