import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

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

  const role = await getUserBranchRole(user.id, branchId);
  if (!role) {
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
      branchId,
      dateTime: { gte: startDate, lt: endDate },
      ...(doctorIds ? { doctorId: { in: doctorIds } } : {}),
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
    select: { dateTime: true },
  });

  const set = new Set<string>();
  for (const row of rows) {
    const d = row.dateTime;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    set.add(`${yyyy}-${mm}-${dd}`);
  }

  return NextResponse.json({ dates: Array.from(set).sort() });
}
