import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

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

/**
 * RBAC: caller must be the doctor themselves OR an OWNER/ADMIN of any branch the
 * doctor is a member of. Cross-branch peek (caller has no shared membership) → 404.
 */
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

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { userId } = await ctx.params;
  const caller = await getCurrentUser();
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const role = await authorizeDoctorAccess(caller.id, userId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rows = await prisma.doctorTimeOff.findMany({
    where: { userId },
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

  const role = await authorizeDoctorAccess(caller.id, userId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // DOCTOR can only manage their own leave; OWNER/ADMIN can manage any doctor's leave.
  if (role === "DOCTOR" && caller.id !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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

  // If branchId is given, ensure the doctor is a member of that branch
  if (branchId) {
    const isMember = await prisma.branchMember.findUnique({
      where: { userId_branchId: { userId, branchId } },
      select: { userId: true },
    });
    if (!isMember) {
      return NextResponse.json({ error: "doctor_not_in_branch" }, { status: 422 });
    }
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
