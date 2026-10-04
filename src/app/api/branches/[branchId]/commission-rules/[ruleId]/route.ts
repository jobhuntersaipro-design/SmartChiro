import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  UpdateRuleSchema,
  effectiveInstant,
  requireCommissionManager,
  ruleProblem,
  serializeRule,
  validationError,
} from "@/lib/commission-rules";
import { paywallCurrentUser } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ branchId: string; ruleId: string }> };

const notFound = () => NextResponse.json({ error: "not_found", message: "Rule not found." }, { status: 404 });

/** Edit a rule (fields omitted stay). OWNER / ADMIN. */
export async function PATCH(req: Request, ctx: RouteCtx): Promise<Response> {
  const blocked = await paywallCurrentUser();
  if (blocked) return blocked;
  const { branchId, ruleId } = await ctx.params;
  const access = await requireCommissionManager(branchId);
  if (access instanceof NextResponse) return access;

  const existing = await prisma.commissionRule.findFirst({ where: { id: ruleId, branchId } });
  if (!existing) return notFound();

  const parsed = UpdateRuleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError("Check the rule details.", parsed.error.flatten());
  const d = parsed.data;
  const problem = ruleProblem({
    basis: d.basis ?? existing.basis,
    rate: d.rate ?? Number(existing.rate),
    treatmentType: d.treatmentType !== undefined ? d.treatmentType : existing.treatmentType,
  });
  if (problem) return validationError(problem);

  if (d.doctorId) {
    const member = await prisma.branchMember.findUnique({
      where: { userId_branchId: { userId: d.doctorId, branchId } },
      select: { id: true },
    });
    if (!member) return validationError("That person isn't a member of this branch.");
  }

  const rule = await prisma.commissionRule.update({
    where: { id: ruleId },
    data: {
      ...(d.doctorId !== undefined ? { doctorId: d.doctorId } : {}),
      ...(d.treatmentType !== undefined ? { treatmentType: d.treatmentType } : {}),
      ...(d.basis !== undefined ? { basis: d.basis } : {}),
      ...(d.rate !== undefined ? { rate: d.rate } : {}),
      ...(d.effectiveFrom !== undefined ? { effectiveFrom: effectiveInstant(d.effectiveFrom) } : {}),
      ...(d.active !== undefined ? { active: d.active } : {}),
    },
  });
  const name = rule.doctorId
    ? (await prisma.user.findUnique({ where: { id: rule.doctorId }, select: { name: true } }))?.name ?? null
    : null;
  return NextResponse.json({ rule: serializeRule(rule, new Map(rule.doctorId ? [[rule.doctorId, name]] : [])) });
}

export async function DELETE(_req: Request, ctx: RouteCtx): Promise<Response> {
  const blocked = await paywallCurrentUser();
  if (blocked) return blocked;
  const { branchId, ruleId } = await ctx.params;
  const access = await requireCommissionManager(branchId);
  if (access instanceof NextResponse) return access;

  const { count } = await prisma.commissionRule.deleteMany({ where: { id: ruleId, branchId } });
  if (count === 0) return notFound();
  return NextResponse.json({ ok: true });
}
