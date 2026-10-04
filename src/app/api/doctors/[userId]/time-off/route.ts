import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { canEditDoctorLeave, managedDoctorBranches } from "@/lib/auth/doctor-access";
import { paywall } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ userId: string }> };

const LEAVE_TYPES = [
  "ANNUAL_LEAVE",
  "SICK_LEAVE",
  "PERSONAL_LEAVE",
  "CONFERENCE",
  "JURY_DUTY",
  "UNPAID_LEAVE",
  "OTHER",
] as const;

const PostBody = z.object({
  type: z.enum(LEAVE_TYPES),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  branchId: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { userId } = await ctx.params;
  const caller = await getCurrentUser();
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // The doctor sees all their leave; a manager sees leave for the branches
  // they manage plus leave that covers every branch — never the doctor's
  // leave at another clinic.
  const { doctor, managed } = await managedDoctorBranches(caller.id, userId);
  const branchIds = caller.id === userId ? doctor : managed;
  if (branchIds.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rows = await prisma.doctorTimeOff.findMany({
    where: { userId, OR: [{ branchId: null }, { branchId: { in: branchIds } }] },
    orderBy: { startDate: "asc" },
    include: { branch: { select: { id: true, name: true } } },
  });

  return NextResponse.json({
    timeOff: rows.map((r) => ({
      id: r.id,
      type: r.type,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      branch: r.branch ? { id: r.branch.id, name: r.branch.name } : null,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const { userId } = await ctx.params;
  const caller = await getCurrentUser();
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const blocked = await paywall(caller.id);
  if (blocked) return blocked;

  const { doctor, managed } = await managedDoctorBranches(caller.id, userId);
  if ((caller.id === userId ? doctor : managed).length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = PostBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const { type, startDate, endDate, branchId, notes } = parsed.data;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end.getTime() <= start.getTime()) {
    return NextResponse.json({ error: "invalid_range" }, { status: 422 });
  }

  // Leave for one branch: the doctor works there and the caller manages it.
  // Leave for every branch: the caller manages all of the doctor's branches.
  if (!(await canEditDoctorLeave(caller.id, userId, branchId ?? null))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const created = await prisma.doctorTimeOff.create({
    data: {
      userId,
      branchId: branchId ?? null,
      type,
      startDate: start,
      endDate: end,
      notes: notes ?? null,
    },
  });

  return NextResponse.json({ timeOffId: created.id }, { status: 201 });
}
