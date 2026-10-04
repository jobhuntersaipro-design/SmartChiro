import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { commissionTotals, computeCommissions, type CommissionFact } from "@/lib/commissions";
import { resolveReportRequest, sqlIn, userNames } from "@/lib/reports/server";
import type { CommissionsReport } from "@/types/commissions";

interface PaymentRow {
  at: Date;
  branchId: string;
  doctorId: string | null;
  treatmentType: string | null;
  sellerId: string | null;
  isPackageSale: boolean;
  sen: bigint | number | string;
}

interface VisitRow {
  at: Date;
  branchId: string;
  doctorId: string;
  treatmentType: string | null;
}

/**
 * Commissions per doctor for the range, using the revenue report's
 * attribution: payments on an appointment's invoice count for that
 * appointment's doctor and treatment; payments on a package-sale invoice
 * count for the seller; manual invoices count for nobody. Payments count net
 * of SST. Completed visits (a visit record, or a COMPLETED appointment with
 * no visit for it or for that patient, doctor and day) drive the fixed
 * per-visit rules. OWNER / ADMIN (`commissions.manage`).
 */
export async function GET(req: Request) {
  const ctx = await resolveReportRequest(req, "commissions.manage");
  if (ctx instanceof NextResponse) return ctx;
  const { range, branchIds } = ctx;
  const branches = sqlIn(branchIds);

  const [payments, visits, rules] = await Promise.all([
    prisma.$queryRaw<PaymentRow[]>`
      SELECT p."receivedAt" AS "at",
             p."branchId" AS "branchId",
             a."doctorId" AS "doctorId",
             a."treatmentType"::text AS "treatmentType",
             pp."soldById" AS "sellerId",
             (pp."id" IS NOT NULL) AS "isPackageSale",
             -- Net of SST: commission is on the clinic's money, not the tax.
             ROUND(p."amount" * 100 * CASE WHEN i."amount" > 0 AND COALESCE(i."taxAmount", 0) > 0
               THEN (i."amount" - i."taxAmount") / i."amount" ELSE 1 END)::bigint AS "sen"
      FROM "Payment" p
      JOIN "Invoice" i ON i."id" = p."invoiceId"
      LEFT JOIN "Appointment" a ON a."id" = i."appointmentId"
      LEFT JOIN "PatientPackage" pp ON pp."invoiceId" = i."id"
      WHERE p."branchId" IN (${branches})
        AND p."receivedAt" >= ${range.start} AND p."receivedAt" < ${range.end}
        AND (pp."id" IS NOT NULL OR a."id" IS NOT NULL)`,
    prisma.$queryRaw<VisitRow[]>`
      SELECT v."visitDate" AS "at",
             COALESCE(a."branchId", pt."branchId") AS "branchId",
             v."doctorId" AS "doctorId",
             a."treatmentType"::text AS "treatmentType"
      FROM "Visit" v
      JOIN "Patient" pt ON pt."id" = v."patientId"
      LEFT JOIN "Appointment" a ON a."id" = v."appointmentId"
      WHERE COALESCE(a."branchId", pt."branchId") IN (${branches})
        AND v."visitDate" >= ${range.start} AND v."visitDate" < ${range.end}
      UNION ALL
      SELECT a."dateTime", a."branchId", a."doctorId", a."treatmentType"::text
      FROM "Appointment" a
      WHERE a."branchId" IN (${branches})
        AND a."status" = 'COMPLETED'
        AND a."dateTime" >= ${range.start} AND a."dateTime" < ${range.end}
        AND NOT EXISTS (SELECT 1 FROM "Visit" v WHERE v."appointmentId" = a."id")
        -- A visit written from the patient page (not linked) for the same
        -- patient, doctor and clinic day is the same visit: count it once.
        AND NOT EXISTS (
          SELECT 1 FROM "Visit" v
          WHERE v."appointmentId" IS NULL AND v."patientId" = a."patientId" AND v."doctorId" = a."doctorId"
            AND (v."visitDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuala_Lumpur')::date
              = (a."dateTime" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuala_Lumpur')::date
        )`,
    prisma.commissionRule.findMany({ where: { branchId: { in: branchIds }, active: true } }),
  ]);

  const facts: CommissionFact[] = [];
  for (const p of payments) {
    const userId = p.isPackageSale ? p.sellerId : p.doctorId;
    if (!userId) continue;
    facts.push({
      kind: p.isPackageSale ? "package" : "payment",
      branchId: p.branchId,
      userId,
      treatmentType: p.isPackageSale ? null : p.treatmentType,
      at: new Date(p.at),
      amountSen: Number(p.sen),
    });
  }
  for (const v of visits) {
    facts.push({ kind: "visit", branchId: v.branchId, userId: v.doctorId, treatmentType: v.treatmentType, at: new Date(v.at), amountSen: 0 });
  }

  const computed = computeCommissions(
    rules.map((r) => ({ ...r, rate: Number(r.rate) })),
    facts,
  );
  const names = await userNames(computed.map((r) => r.userId));
  // Plain names: package sellers may be front-desk staff, not doctors.
  const rows = computed.map((r) => ({ ...r, name: names.get(r.userId)?.trim() || "Unknown staff" }));

  const body: CommissionsReport = {
    range: ctx.rangeJson,
    scope: ctx.scope,
    rows,
    totals: commissionTotals(computed),
    ruleCount: rules.length,
  };
  return NextResponse.json(body);
}
