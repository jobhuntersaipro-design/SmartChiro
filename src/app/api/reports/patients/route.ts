import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACTIVE_PATIENT_STATUS } from "@/lib/stats-scope";
import { resolveReportRequest, sqlIn } from "@/lib/reports/server";
import type { PatientsReport } from "@/types/reports";

/** An active patient is lapsed once this many days pass without a visit and nothing is booked. */
const LAPSED_AFTER_DAYS = 60;
const LAPSED_LIST_LIMIT = 100;
const OPEN_STATUSES = ["SCHEDULED", "CHECKED_IN", "IN_PROGRESS"] as const;

interface LapsedRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  branchName: string;
  lastVisit: Date;
  total: bigint | number;
}

/**
 * Retention: new patients (registered in range), patients seen (a visit in
 * range), returning (seen and with an earlier visit), and — as of now —
 * lapsed patients (active, last visit 60+ days ago, nothing booked), most
 * recently lapsed first.
 */
export async function GET(req: Request) {
  const ctx = await resolveReportRequest(req);
  if (ctx instanceof NextResponse) return ctx;
  const { range, branchIds, now } = ctx;
  const inRange = { gte: range.start, lt: range.end };
  const scope = { branchId: { in: branchIds } };
  const cutoff = new Date(now.getTime() - LAPSED_AFTER_DAYS * 86_400_000);

  const [newPatients, seen, returning, lapsed] = await Promise.all([
    prisma.patient.count({ where: { ...scope, createdAt: inRange } }),
    prisma.patient.count({ where: { ...scope, visits: { some: { visitDate: inRange } } } }),
    prisma.patient.count({
      where: { ...scope, AND: [{ visits: { some: { visitDate: inRange } } }, { visits: { some: { visitDate: { lt: range.start } } } }] },
    }),
    prisma.$queryRaw<LapsedRow[]>`
      SELECT p."id", p."firstName", p."lastName", p."phone", b."name" AS "branchName",
             MAX(v."visitDate") AS "lastVisit", COUNT(*) OVER () AS "total"
      FROM "Patient" p
      JOIN "Branch" b ON b."id" = p."branchId"
      JOIN "Visit" v ON v."patientId" = p."id"
      WHERE p."branchId" IN (${sqlIn(branchIds)})
        AND p."status" = ${ACTIVE_PATIENT_STATUS}
        AND NOT EXISTS (
          SELECT 1 FROM "Appointment" a
          WHERE a."patientId" = p."id" AND a."dateTime" >= ${now}
            AND a."status"::text IN (${sqlIn([...OPEN_STATUSES])})
        )
      GROUP BY p."id", b."name"
      HAVING MAX(v."visitDate") < ${cutoff}
      ORDER BY MAX(v."visitDate") DESC, p."lastName" ASC
      LIMIT ${LAPSED_LIST_LIMIT}`,
  ]);

  const body: PatientsReport = {
    range: ctx.rangeJson,
    scope: ctx.scope,
    asOf: now.toISOString(),
    newPatients,
    seen,
    returning,
    lapsed: lapsed.length > 0 ? Number(lapsed[0].total) : 0,
    lapsedAfterDays: LAPSED_AFTER_DAYS,
    lapsedList: lapsed.map((r) => ({
      id: r.id,
      name: `${r.firstName} ${r.lastName}`,
      phone: r.phone,
      branchName: r.branchName,
      lastVisit: r.lastVisit.toISOString(),
    })),
  };
  return NextResponse.json(body);
}
