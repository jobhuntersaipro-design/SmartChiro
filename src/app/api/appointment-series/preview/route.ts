import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-utils";
import { MAX_SERIES_OCCURRENCES } from "@/lib/series";
import {
  SeriesRuleSchema,
  TreatmentTypeSchema,
  occurrenceToJson,
  planSeries,
  resolveBookingContext,
  ruleFromInput,
  seriesRuleHasEnd,
} from "@/lib/series-service";

const Body = SeriesRuleSchema.extend({
  branchId: z.string().min(1),
  doctorId: z.string().min(1),
  patientId: z.string().min(1).optional(),
  duration: z.number().int().positive().max(480).default(30),
  treatmentType: TreatmentTypeSchema.optional(),
}).refine(seriesRuleHasEnd, { message: "give a number of visits or an end date", path: ["count"] });

/**
 * Dry run of a repeat rule: every future occurrence with its problems
 * (conflict, break, outside_hours, past, time_off) so the booking dialog can
 * show which dates will be skipped. Nothing is written.
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
  const context = await resolveBookingContext(user.id, { branchId: d.branchId, doctorId: d.doctorId, patientId: d.patientId });
  if (!context.ok) return NextResponse.json({ error: context.error, message: context.message }, { status: context.status });

  const checks = await planSeries({ rule: ruleFromInput(d), doctorId: d.doctorId, branchId: d.branchId, duration: d.duration });
  const okCount = checks.filter((c) => c.ok).length;
  return NextResponse.json({
    occurrences: checks.map(occurrenceToJson),
    summary: { total: checks.length, ok: okCount, withProblems: checks.length - okCount },
    capped: d.count === undefined && checks.length >= MAX_SERIES_OCCURRENCES,
  });
}
