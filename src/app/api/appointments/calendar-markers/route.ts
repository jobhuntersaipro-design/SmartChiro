import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { branchIdsForParam } from "@/lib/branch-context";
import { clinicDateKey } from "@/lib/clinic-time";

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

  // "all" = every branch the caller belongs to (the "All branches" list).
  if (branchId !== "all" && !(await getUserBranchRole(user.id, branchId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const branchIds = await branchIdsForParam(user.id, branchId);
  if (branchIds.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const doctorIdsParam = url.searchParams.get("doctorIds");
  const doctorIds = doctorIdsParam ? doctorIdsParam.split(",").filter(Boolean) : null;

  // Pull dateTime fields only and bucket by local YYYY-MM-DD on the server.
  // For typical month-view windows (~30 days × 100 events/day = 3k rows max),
  // a flat select is faster than a $queryRaw groupBy with timezone math.
  const rows = await prisma.appointment.findMany({
    where: {
      branchId: { in: branchIds },
      dateTime: { gte: startDate, lt: endDate },
      ...(doctorIds ? { doctorId: { in: doctorIds } } : {}),
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
    select: { dateTime: true },
  });

  const set = new Set<string>();
  for (const row of rows) {
    // Clinic day, not the server's UTC day (bookings before 8 AM MYT landed on the previous date).
    set.add(clinicDateKey(row.dateTime));
  }

  return NextResponse.json({ dates: Array.from(set).sort() });
}
