import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManagePackages, getBranchRole } from "@/lib/branch-access";

type RouteContext = { params: Promise<{ packageId: string }> };

async function loadPackageWithRole(userId: string, packageId: string) {
  const pkg = await prisma.package.findUnique({ where: { id: packageId } });
  if (!pkg) return { pkg: null, role: null };
  const role = await getBranchRole(userId, pkg.branchId);
  return { pkg, role };
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packageId } = await params;
  const { pkg, role } = await loadPackageWithRole(session.user.id, packageId);
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });
  if (!canManagePackages(role)) {
    return NextResponse.json({ error: "Only OWNER or ADMIN can edit packages" }, { status: 403 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    data.name = name;
  }
  if (body.description !== undefined) {
    data.description = typeof body.description === "string" ? body.description.trim() || null : null;
  }
  if (body.sessionCount !== undefined) {
    const v = Number(body.sessionCount);
    if (!Number.isInteger(v) || v <= 0) {
      return NextResponse.json({ error: "sessionCount must be a positive integer" }, { status: 400 });
    }
    data.sessionCount = v;
  }
  if (body.price !== undefined) {
    const v = Number(body.price);
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
    }
    data.price = v;
  }
  if (body.validityDays !== undefined) {
    if (body.validityDays == null || body.validityDays === "") data.validityDays = null;
    else {
      const v = Number(body.validityDays);
      if (!Number.isInteger(v) || v <= 0) {
        return NextResponse.json({ error: "validityDays must be a positive integer or null" }, { status: 400 });
      }
      data.validityDays = v;
    }
  }
  if (body.status === "ACTIVE" || body.status === "ARCHIVED") data.status = body.status;

  const updated = await prisma.package.update({ where: { id: packageId }, data });

  return NextResponse.json({
    package: {
      id: updated.id,
      branchId: updated.branchId,
      name: updated.name,
      description: updated.description,
      sessionCount: updated.sessionCount,
      price: Number(updated.price),
      currency: updated.currency,
      validityDays: updated.validityDays,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packageId } = await params;
  const { pkg, role } = await loadPackageWithRole(session.user.id, packageId);
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });
  if (!canManagePackages(role)) {
    return NextResponse.json({ error: "Only OWNER or ADMIN can archive packages" }, { status: 403 });
  }

  // Soft delete
  await prisma.package.update({
    where: { id: packageId },
    data: { status: "ARCHIVED" },
  });

  return NextResponse.json({ success: true });
}
