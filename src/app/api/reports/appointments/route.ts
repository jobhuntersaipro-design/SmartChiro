import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { displayDoctorName } from "@/lib/format";
import { appointmentCounts, type StatusCount } from "@/lib/reports/rates";
import { resolveReportRequest, userNames } from "@/lib/reports/server";
import type { AppointmentsReport } from "@/types/reports";

/**
 * Appointments dated in the range: booked (all), completed, cancelled,
 * no-show and still open, with no-show and cancellation rates, per doctor.
 */
export async function GET(req: Request) {
  const ctx = await resolveReportRequest(req);
  if (ctx instanceof NextResponse) return ctx;

  const grouped = await prisma.appointment.groupBy({
    by: ["doctorId", "status"],
    where: { branchId: { in: ctx.branchIds }, dateTime: { gte: ctx.range.start, lt: ctx.range.end } },
    _count: { _all: true },
  });

  const perDoctor = new Map<string, StatusCount[]>();
  for (const g of grouped) {
    const list = perDoctor.get(g.doctorId) ?? [];
    list.push({ status: g.status, count: g._count._all });
    perDoctor.set(g.doctorId, list);
  }
  const names = await userNames([...perDoctor.keys()]);

  const body: AppointmentsReport = {
    range: ctx.rangeJson,
    scope: ctx.scope,
    totals: appointmentCounts(grouped.map((g) => ({ status: g.status, count: g._count._all }))),
    byDoctor: [...perDoctor]
      .map(([doctorId, rows]) => ({ doctorId, name: displayDoctorName(names.get(doctorId)), ...appointmentCounts(rows) }))
      .sort((a, b) => b.booked - a.booked || a.name.localeCompare(b.name)),
  };
  return NextResponse.json(body);
}
