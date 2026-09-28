import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { canSellPackages, canViewPackages, loadPatientAccess } from "@/lib/package-access";
import {
  PATIENT_PACKAGE_INCLUDE,
  SellPackageSchema,
  resolveSaleSource,
  sellPackage,
  serializePatientPackage,
  userNamesFor,
} from "@/lib/package-service";

type RouteCtx = { params: Promise<{ patientId: string }> };

const notFound = () => NextResponse.json({ error: "not_found", message: "Patient not found." }, { status: 404 });

/** The patient's packages (newest first) with redemption history and effective status. */
export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { patientId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Sign in required." }, { status: 401 });

  const access = await loadPatientAccess(user.id, patientId);
  if (!access) return notFound();
  // TODO(front-desk): FRONT_DESK may view packages.
  if (!canViewPackages(access)) {
    return NextResponse.json({ error: "forbidden", message: "You can't view this patient's packages." }, { status: 403 });
  }

  const rows = await prisma.patientPackage.findMany({
    where: { patientId },
    orderBy: { purchasedAt: "desc" },
    include: PATIENT_PACKAGE_INCLUDE,
  });
  const names = await userNamesFor(rows);
  const now = new Date();
  const packages = rows.map((r) => serializePatientPackage(r, names, now));
  const active = packages.filter((p) => p.effectiveStatus === "ACTIVE");
  return NextResponse.json({
    packages,
    summary: {
      activeCount: active.length,
      sessionsLeft: active.reduce((n, p) => n + p.sessionsLeft, 0),
    },
  });
}

/** Sell a package: `{ templateId }` from the catalogue, or a custom `{ name, sessions, price, … }`. */
export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const { patientId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Sign in required." }, { status: 401 });

  const access = await loadPatientAccess(user.id, patientId);
  if (!access) return notFound();
  // TODO(front-desk): FRONT_DESK may sell packages.
  if (!canSellPackages(access.role)) {
    return NextResponse.json({ error: "forbidden", message: "Only owners and admins sell packages." }, { status: 403 });
  }

  const parsed = SellPackageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", message: "Choose a package or enter its details.", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const source = await resolveSaleSource(parsed.data, access.patient.branchId);
  if (!source) {
    return NextResponse.json({ error: "template_not_found", message: "That package is not on sale in this branch." }, { status: 404 });
  }

  const created = await prisma.$transaction((tx) =>
    sellPackage(tx, { ...source, patientId, branchId: access.patient.branchId, soldById: user.id }),
  );
  const names = await userNamesFor([created]);
  return NextResponse.json({ package: serializePatientPackage(created, names) }, { status: 201 });
}
