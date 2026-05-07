import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { expandBreakTimes, expandTimeOff } from "@/lib/availability";

type RouteCtx = { params: Promise<{ branchId: string }> };

/**
 * GET /api/branches/[branchId]/availability?start=&end=&doctorIds=
 *
 * Returns AvailabilitySlot[] (TIME_OFF + BREAK_TIME) clipped to the calendar window.
 * Used by the per-doctor day calendar to render the "NOT AVAILABLE" hatched bands and
 * the "BREAK TIME" full-row bands.
 */
export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const caller = await getCurrentUser();
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const role = await getUserBranchRole(caller.id, branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  // Constrain results to doctors who are members of this branch
  const branchDoctors = await prisma.branchMember.findMany({
    where: { branchId, role: { in: ["OWNER", "ADMIN", "DOCTOR"] } },
    select: { userId: true },
  });
  const doctorIdsParam = url.searchParams.get("doctorIds");
  const requested = doctorIdsParam ? doctorIdsParam.split(",").filter(Boolean) : null;
  const doctorIds = requested
    ? requested.filter((id) => branchDoctors.some((d) => d.userId === id))
    : branchDoctors.map((d) => d.userId);

  if (doctorIds.length === 0) {
    return NextResponse.json({ slots: [] });
  }

  const [breakRows, timeOffRows] = await Promise.all([
    prisma.doctorBreakTime.findMany({
      where: { branchId, userId: { in: doctorIds } },
      select: { userId: true, branchId: true, dayOfWeek: true, startMinute: true, endMinute: true, label: true },
    }),
    prisma.doctorTimeOff.findMany({
      where: {
        userId: { in: doctorIds },
        OR: [{ branchId: null }, { branchId }],
        // Anything overlapping the window
        startDate: { lt: endDate },
        endDate: { gt: startDate },
      },
      select: { userId: true, branchId: true, type: true, startDate: true, endDate: true, notes: true },
    }),
  ]);

  const slots = [
    ...expandBreakTimes(breakRows, startDate, endDate),
    ...expandTimeOff(timeOffRows, startDate, endDate),
  ];

  return NextResponse.json({ slots });
}
