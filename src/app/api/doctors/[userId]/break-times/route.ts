import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

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

async function authorizeDoctorAccess(callerId: string, doctorId: string): Promise<"OWNER" | "ADMIN" | "DOCTOR" | null> {
  if (callerId === doctorId) return "DOCTOR";
  const sharedBranches = await prisma.branchMember.findMany({
    where: { userId: doctorId },
    select: { branchId: true },
  });
  if (sharedBranches.length === 0) return null;
  const callerMembership = await prisma.branchMember.findFirst({
    where: {
      userId: callerId,
      branchId: { in: sharedBranches.map((b) => b.branchId) },
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: { role: true },
  });
  return callerMembership?.role ?? null;
}

export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  const { userId } = await ctx.params;
  const caller = await getCurrentUser();
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const role = await authorizeDoctorAccess(caller.id, userId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = new URL(req.url);
  const branchId = url.searchParams.get("branchId");

  const rows = await prisma.doctorBreakTime.findMany({
    where: { userId, ...(branchId ? { branchId } : {}) },
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

  const role = await authorizeDoctorAccess(caller.id, userId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (role === "DOCTOR" && caller.id !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

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

  // Doctor must be a member of this branch
  const isMember = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId } },
    select: { userId: true },
  });
  if (!isMember) {
    return NextResponse.json({ error: "doctor_not_in_branch" }, { status: 422 });
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
