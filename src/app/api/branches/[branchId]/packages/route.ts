import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManagePackages, getBranchRole } from "@/lib/branch-access";

type RouteContext = { params: Promise<{ branchId: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { branchId } = await params;
  const role = await getBranchRole(session.user.id, branchId);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("includeArchived") === "true";

  const where: Record<string, unknown> = { branchId };
  if (!includeArchived) where.status = "ACTIVE";

  const packages = await prisma.package.findMany({
    where,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { _count: { select: { patientPackages: true } } },
  });

  return NextResponse.json({
    packages: packages.map((p) => ({
      id: p.id,
      branchId: p.branchId,
      name: p.name,
      description: p.description,
      sessionCount: p.sessionCount,
      price: Number(p.price),
      currency: p.currency,
      validityDays: p.validityDays,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      patientCount: p._count.patientPackages,
    })),
  });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { branchId } = await params;
  const role = await getBranchRole(session.user.id, branchId);
  if (!canManagePackages(role)) {
    return NextResponse.json({ error: "Only OWNER or ADMIN can create packages" }, { status: 403 });
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sessionCount = Number(body.sessionCount);
  const price = Number(body.price);
  const description = typeof body.description === "string" ? body.description.trim() : null;
  const validityDays =
    body.validityDays == null || body.validityDays === ""
      ? null
      : Number(body.validityDays);

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!Number.isInteger(sessionCount) || sessionCount <= 0) {
    return NextResponse.json({ error: "sessionCount must be a positive integer" }, { status: 400 });
  }
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
  }
  if (validityDays != null && (!Number.isInteger(validityDays) || validityDays <= 0)) {
    return NextResponse.json({ error: "validityDays must be a positive integer or null" }, { status: 400 });
  }

  const created = await prisma.package.create({
    data: {
      branchId,
      name,
      description: description || null,
      sessionCount,
      price,
      validityDays,
    },
  });

  return NextResponse.json(
    {
      package: {
        id: created.id,
        branchId: created.branchId,
        name: created.name,
        description: created.description,
        sessionCount: created.sessionCount,
        price: Number(created.price),
        currency: created.currency,
        validityDays: created.validityDays,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
