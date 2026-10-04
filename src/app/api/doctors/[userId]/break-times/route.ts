import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { managedDoctorBranches } from "@/lib/auth/doctor-access";
import { paywall } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ userId: string }> };

const Slot = z.object({
  branchId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(24 * 60 - 1),
  endMinute: z.number().int().min(1).max(24 * 60),
  label: z.string().max(80).nullable().optional(),
});

const PutBody = z.object({
  branchId: z.string().min(1),
  slots: z.array(Slot).max(50),
});

/**
 * Branches whose break times the caller may see and change: all of the
 * doctor's own branches for the doctor, else the shared branches where the
 * caller is OWNER/ADMIN. Null when that's none.
 */
async function visibleBranches(callerId: string, doctorId: string): Promise<string[] | null> {
  const { doctor, managed } = await managedDoctorBranches(callerId, doctorId);
  const ids = callerId === doctorId ? doctor : managed;
  return ids.length > 0 ? ids : null;
}

export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  const { userId } = await ctx.params;
  const caller = await getCurrentUser();
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const branchIds = await visibleBranches(caller.id, userId);
  if (!branchIds) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = new URL(req.url);
  const branchId = url.searchParams.get("branchId");

  const rows = await prisma.doctorBreakTime.findMany({
    where: { userId, branchId: branchId ? { in: branchIds.filter((id) => id === branchId) } : { in: branchIds } },
    orderBy: [{ branchId: "asc" }, { dayOfWeek: "asc" }, { startMinute: "asc" }],
  });

  return NextResponse.json({
    breakTimes: rows.map((r) => ({
      id: r.id,
      branchId: r.branchId,
      dayOfWeek: r.dayOfWeek,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
      label: r.label,
    })),
  });
}

/**
 * PUT replaces the doctor's break-time set FOR ONE BRANCH. Other branches' rows
 * are untouched. This avoids the multi-branch UI having to merge/diff slots itself.
 */
export async function PUT(req: Request, ctx: RouteCtx): Promise<Response> {
  const { userId } = await ctx.params;
  const caller = await getCurrentUser();
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const blocked = await paywall(caller.id);
  if (blocked) return blocked;

  const branchIds = await visibleBranches(caller.id, userId);
  if (!branchIds) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = PutBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { branchId, slots } = parsed.data;

  // All slot.branchId values must equal the request's branchId to avoid scope confusion
  for (const s of slots) {
    if (s.branchId !== branchId) {
      return NextResponse.json({ error: "branch_mismatch" }, { status: 422 });
    }
    if (s.endMinute <= s.startMinute) {
      return NextResponse.json({ error: "invalid_range" }, { status: 422 });
    }
  }

  // The doctor works in this branch and the caller manages it (or is the doctor).
  if (!branchIds.includes(branchId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.doctorBreakTime.deleteMany({ where: { userId, branchId } }),
    ...(slots.length > 0
      ? [
          prisma.doctorBreakTime.createMany({
            data: slots.map((s) => ({
              userId,
              branchId,
              dayOfWeek: s.dayOfWeek,
              startMinute: s.startMinute,
              endMinute: s.endMinute,
              label: s.label ?? null,
            })),
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true, count: slots.length });
}
