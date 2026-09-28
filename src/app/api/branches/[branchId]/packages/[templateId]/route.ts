import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { isManagerRole } from "@/lib/package-access";
import { PackageTemplateSchema, roundMoney, serializeTemplate } from "@/lib/package-service";

type RouteCtx = { params: Promise<{ branchId: string; templateId: string }> };

type Guard = { ok: true } | { ok: false; res: Response };

/** Member of the branch (404 otherwise), manager (403 otherwise), template in that branch (404 otherwise). */
async function guard(branchId: string, templateId: string): Promise<Guard> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, res: NextResponse.json({ error: "unauthorized", message: "Sign in required." }, { status: 401 }) };
  }
  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return { ok: false, res: NextResponse.json({ error: "not_found", message: "Branch not found." }, { status: 404 }) };
  // TODO(front-desk): catalogue stays OWNER/ADMIN only.
  if (!isManagerRole(role)) {
    return {
      ok: false,
      res: NextResponse.json({ error: "forbidden", message: "Only owners and admins manage packages." }, { status: 403 }),
    };
  }
  const template = await prisma.packageTemplate.findUnique({ where: { id: templateId }, select: { branchId: true } });
  if (!template || template.branchId !== branchId) {
    return { ok: false, res: NextResponse.json({ error: "not_found", message: "Package not found." }, { status: 404 }) };
  }
  return { ok: true };
}

/** Edit a template. Packages already sold keep their snapshot. */
export async function PATCH(req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId, templateId } = await ctx.params;
  const g = await guard(branchId, templateId);
  if (!g.ok) return g.res;

  const parsed = PackageTemplateSchema.partial()
    .refine((d) => Object.keys(d).length > 0, "at least one field required")
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", message: "Check the package details.", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const d = parsed.data;
  const updated = await prisma.packageTemplate.update({
    where: { id: templateId },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.sessions !== undefined ? { sessions: d.sessions } : {}),
      ...(d.price !== undefined ? { price: roundMoney(d.price) } : {}),
      ...(d.validityDays !== undefined ? { validityDays: d.validityDays } : {}),
      ...(d.treatmentTypes !== undefined ? { treatmentTypes: [...new Set(d.treatmentTypes)] } : {}),
      ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
    },
  });
  return NextResponse.json({ template: serializeTemplate(updated) });
}

/** Soft delete: the template is retired (isActive=false); sold packages are untouched. */
export async function DELETE(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId, templateId } = await ctx.params;
  const g = await guard(branchId, templateId);
  if (!g.ok) return g.res;
  const updated = await prisma.packageTemplate.update({ where: { id: templateId }, data: { isActive: false } });
  return NextResponse.json({ template: serializeTemplate(updated) });
}
