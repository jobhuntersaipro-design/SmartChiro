import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CreateRuleSchema,
  effectiveInstant,
  requireCommissionManager,
  ruleProblem,
  serializeRule,
  validationError,
} from "@/lib/commission-rules";
import type { CommissionRulesResponse } from "@/types/commissions";

type RouteCtx = { params: Promise<{ branchId: string }> };

/** Everyone who can earn commission here: clinicians first, then other staff. */
async function branchStaff(branchId: string) {
  const members = await prisma.branchMember.findMany({
    where: { branchId },
    select: { role: true, user: { select: { id: true, name: true } } },
  });
  const order = { DOCTOR: 0, OWNER: 1, ADMIN: 2, FRONT_DESK: 3 } as const;
  return members
    .map((m) => ({ id: m.user.id, name: m.user.name, role: m.role }))
    .sort((a, b) => order[a.role] - order[b.role] || (a.name ?? "").localeCompare(b.name ?? ""));
}

/** Commission rules of a branch with the staff picker. OWNER / ADMIN. */
export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const access = await requireCommissionManager(branchId);
  if (access instanceof NextResponse) return access;

  const [rules, staff] = await Promise.all([
    prisma.commissionRule.findMany({
      where: { branchId },
      orderBy: [{ active: "desc" }, { effectiveFrom: "desc" }, { createdAt: "desc" }],
    }),
    branchStaff(branchId),
  ]);
  const names = new Map(staff.map((s) => [s.id, s.name]));
  const body: CommissionRulesResponse = { rules: rules.map((r) => serializeRule(r, names)), staff };
  return NextResponse.json(body);
}

export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const access = await requireCommissionManager(branchId);
  if (access instanceof NextResponse) return access;

  const parsed = CreateRuleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError("Check the rule details.", parsed.error.flatten());
  const d = parsed.data;
  const problem = ruleProblem(d);
  if (problem) return validationError(problem);

  const staff = await branchStaff(branchId);
  if (d.doctorId && !staff.some((s) => s.id === d.doctorId)) {
    return validationError("That person isn't a member of this branch.");
  }

  const rule = await prisma.commissionRule.create({
    data: {
      branchId,
      doctorId: d.doctorId,
      treatmentType: d.treatmentType,
      basis: d.basis,
      rate: d.rate,
      effectiveFrom: effectiveInstant(d.effectiveFrom),
      active: d.active,
      createdById: access.userId,
    },
  });
  return NextResponse.json(
    { rule: serializeRule(rule, new Map(staff.map((s) => [s.id, s.name]))) },
    { status: 201 },
  );
}
