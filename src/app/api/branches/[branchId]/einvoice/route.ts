import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { connectionInfo } from "@/lib/myinvois/access";
import { BRANCH_EINVOICE_SELECT, branchStateCode } from "@/lib/myinvois/service";
import { validateSupplier } from "@/lib/myinvois/validate";
import type { BranchEInvoiceSettings } from "@/types/einvoice";
import { paywallCurrentUser } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ branchId: string }> };
type BranchRow = NonNullable<Awaited<ReturnType<typeof load>>>;

const load = (branchId: string) => prisma.branch.findUnique({ where: { id: branchId }, select: BRANCH_EINVOICE_SELECT });

function serialize(b: BranchRow, role: string): BranchEInvoiceSettings {
  return {
    ...connectionInfo(),
    branchId: b.id,
    msicCode: b.msicCode,
    businessActivity: b.businessActivity,
    einvoiceEnabled: b.einvoiceEnabled,
    ...branchStateCode(b),
    readiness: validateSupplier(b),
    canEdit: role === "OWNER",
  };
}

async function roleFor(branchId: string) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (role !== "OWNER" && role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return { role } as const;
}

/** e-Invoice (MyInvois) settings and readiness for a branch. OWNER / ADMIN read. Credentials are never returned. */
export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const auth = await roleFor(branchId);
  if (auth instanceof Response) return auth;
  const branch = await load(branchId);
  if (!branch) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ settings: serialize(branch, auth.role) });
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

const Body = z
  .object({
    msicCode: z
      .string()
      .trim()
      .regex(/^(\d{5})?$/, "5 digits")
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v || null)),
    businessActivity: optionalText(300),
    einvoiceEnabled: z.boolean().optional(),
  })
  .strict();

/** Update MSIC code, business activity and the e-invoicing toggle. OWNER only. */
export async function PUT(req: Request, ctx: RouteCtx): Promise<Response> {
  const blocked = await paywallCurrentUser();
  if (blocked) return blocked;
  const { branchId } = await ctx.params;
  const auth = await roleFor(branchId);
  if (auth instanceof Response) return auth;
  if (auth.role !== "OWNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 422 });
  const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  const branch = await prisma.branch.update({ where: { id: branchId }, data, select: BRANCH_EINVOICE_SELECT });
  return NextResponse.json({ settings: serialize(branch, auth.role) });
}
