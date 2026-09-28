import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

type RouteCtx = { params: Promise<{ branchId: string }> };

/** Patient portal settings (Phase 7.2). OWNER/ADMIN read and edit. */
async function authorise(branchId: string): Promise<Response | null> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (role !== "OWNER" && role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const denied = await authorise(branchId);
  if (denied) return denied;
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { portalCancelHours: true } });
  if (!branch) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ portalCancelHours: branch.portalCancelHours });
}

/** 0–336 hours (two weeks); 0 lets patients cancel online until the start time. */
const Body = z.object({ portalCancelHours: z.number().int().min(0).max(336) }).strict();

export async function PUT(req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const denied = await authorise(branchId);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 422 });
  }
  const branch = await prisma.branch.update({
    where: { id: branchId },
    data: { portalCancelHours: parsed.data.portalCancelHours },
    select: { portalCancelHours: true },
  });
  return NextResponse.json({ portalCancelHours: branch.portalCancelHours });
}
