import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { isManagerRole } from "@/lib/package-access";
import { PackageTemplateSchema, roundMoney, serializeTemplate } from "@/lib/package-service";

type RouteCtx = { params: Promise<{ branchId: string }> };

/** Package catalogue of a branch. Any member sees active templates; managers may ask for inactive ones too. */
export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Sign in required." }, { status: 401 });

  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return NextResponse.json({ error: "not_found", message: "Branch not found." }, { status: 404 });

  // TODO(front-desk): FRONT_DESK sees active templates (like DOCTOR) — no change needed.
  const includeInactive = isManagerRole(role) && new URL(req.url).searchParams.get("includeInactive") === "true";
  const templates = await prisma.packageTemplate.findMany({
    where: { branchId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ templates: templates.map(serializeTemplate) });
}

export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Sign in required." }, { status: 401 });

  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return NextResponse.json({ error: "not_found", message: "Branch not found." }, { status: 404 });
  // TODO(front-desk): catalogue stays OWNER/ADMIN only.
  if (!isManagerRole(role)) {
    return NextResponse.json({ error: "forbidden", message: "Only owners and admins manage packages." }, { status: 403 });
  }

  const parsed = PackageTemplateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", message: "Check the package details.", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const d = parsed.data;
  const created = await prisma.packageTemplate.create({
    data: {
      branchId,
      name: d.name,
      description: d.description ?? null,
      sessions: d.sessions,
      price: roundMoney(d.price),
      validityDays: d.validityDays ?? null,
      treatmentTypes: [...new Set(d.treatmentTypes ?? [])],
      isActive: d.isActive ?? true,
    },
  });
  return NextResponse.json({ template: serializeTemplate(created) }, { status: 201 });
}
