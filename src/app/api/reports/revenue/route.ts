import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";
import { buildTrend, granularityFor, type DailyMoney } from "@/lib/reports/buckets";
import { splitRevenue, type RevenueFact } from "@/lib/reports/revenue";
import { resolveReportRequest, sqlIn, userNames } from "@/lib/reports/server";
import type { RevenueReport } from "@/types/reports";

interface FactRow {
  day: string;
  branchId: string;
  doctorId: string | null;
  treatmentType: string | null;
  isPackageSale: boolean;
  sen: bigint | number | string | null;
  refundSen?: bigint | number | string | null;
  n: bigint | number;
}

/** "YYYY-MM-DD" of a UTC-stored `timestamp without time zone` column, in clinic time. */
const clinicDay = (column: Prisma.Sql) =>
  Prisma.sql`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${CLINIC_TIME_ZONE}, 'YYYY-MM-DD')`;

/**
 * Money collected (payments received in range, refunds netted off) and
 * invoiced (issued in range; drafts and cancelled invoices excluded), per
 * clinic day, branch and origin: the invoice's appointment doctor and
 * treatment, a package sale, or neither.
 */
export async function GET(req: Request) {
  const ctx = await resolveReportRequest(req);
  if (ctx instanceof NextResponse) return ctx;
  const { range, branchIds } = ctx;
  const branches = sqlIn(branchIds);

  const [payments, invoices] = await Promise.all([
    prisma.$queryRaw<FactRow[]>`
      SELECT ${clinicDay(Prisma.sql`p."receivedAt"`)} AS "day",
             p."branchId" AS "branchId",
             a."doctorId" AS "doctorId",
             a."treatmentType"::text AS "treatmentType",
             (pp."id" IS NOT NULL) AS "isPackageSale",
             SUM(p."amount" * 100)::bigint AS "sen",
             SUM(CASE WHEN p."amount" < 0 THEN -p."amount" * 100 ELSE 0 END)::bigint AS "refundSen",
             COUNT(*) FILTER (WHERE p."amount" > 0) AS "n"
      FROM "Payment" p
      JOIN "Invoice" i ON i."id" = p."invoiceId"
      LEFT JOIN "Appointment" a ON a."id" = i."appointmentId"
      LEFT JOIN "PatientPackage" pp ON pp."invoiceId" = i."id"
      WHERE p."branchId" IN (${branches})
        AND p."receivedAt" >= ${range.start} AND p."receivedAt" < ${range.end}
      GROUP BY 1, 2, 3, 4, 5`,
    prisma.$queryRaw<FactRow[]>`
      SELECT ${clinicDay(Prisma.sql`i."issuedAt"`)} AS "day",
             i."branchId" AS "branchId",
             a."doctorId" AS "doctorId",
             a."treatmentType"::text AS "treatmentType",
             (pp."id" IS NOT NULL) AS "isPackageSale",
             SUM(i."amount" * 100)::bigint AS "sen",
             COUNT(*) AS "n"
      FROM "Invoice" i
      LEFT JOIN "Appointment" a ON a."id" = i."appointmentId"
      LEFT JOIN "PatientPackage" pp ON pp."invoiceId" = i."id"
      WHERE i."branchId" IN (${branches})
        AND i."status" NOT IN ('CANCELLED', 'DRAFT')
        AND i."issuedAt" >= ${range.start} AND i."issuedAt" < ${range.end}
      GROUP BY 1, 2, 3, 4, 5`,
  ]);

  const fact = (r: FactRow, collectedSen: number, invoicedSen: number): RevenueFact => ({
    day: r.day,
    branchId: r.branchId,
    doctorId: r.doctorId,
    treatmentType: r.treatmentType,
    isPackageSale: r.isPackageSale,
    collectedSen,
    invoicedSen,
  });
  const facts = [
    ...payments.map((r) => fact(r, Number(r.sen ?? 0), 0)),
    ...invoices.map((r) => fact(r, 0, Number(r.sen ?? 0))),
  ];

  const doctorIds = [...new Set(facts.flatMap((f) => (f.doctorId ? [f.doctorId] : [])))];
  const splits = splitRevenue(facts, { branches: ctx.branchNames, doctors: await userNames(doctorIds) }, branchIds);

  const byDay = new Map<string, DailyMoney>();
  for (const f of facts) {
    const d = byDay.get(f.day) ?? { day: f.day, collectedSen: 0, invoicedSen: 0 };
    d.collectedSen += f.collectedSen;
    d.invoicedSen += f.invoicedSen;
    byDay.set(f.day, d);
  }
  const granularity = granularityFor(range.days);

  const body: RevenueReport = {
    range: ctx.rangeJson,
    scope: ctx.scope,
    granularity,
    totals: {
      collected: splits.totals.collected,
      refunds: payments.reduce((sum, r) => sum + Number(r.refundSen ?? 0), 0) / 100,
      payments: payments.reduce((sum, r) => sum + Number(r.n), 0),
      invoiced: splits.totals.invoiced,
      invoices: invoices.reduce((sum, r) => sum + Number(r.n), 0),
    },
    trend: buildTrend(range, [...byDay.values()], granularity),
    byBranch: splits.byBranch,
    byDoctor: splits.byDoctor,
    byTreatment: splits.byTreatment,
  };
  return NextResponse.json(body);
}
