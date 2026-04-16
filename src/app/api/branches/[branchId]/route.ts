import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ branchId: string }> };

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId } = await params;

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { patients: true } },
    },
  });

  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  // Check caller is a member
  const isMember = branch.members.some((m) => m.userId === session.user!.id);
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    branch: {
      id: branch.id,
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      email: branch.email,
      members: branch.members.map((m) => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      })),
      patientCount: branch._count.patients,
      createdAt: branch.createdAt.toISOString(),
      updatedAt: branch.updatedAt.toISOString(),
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId } = await params;

  // Check branch exists
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  // Check caller is OWNER or ADMIN
  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId } },
  });

  if (!membership || membership.role === "DOCTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, address, phone, email } = body;

  if (name !== undefined && (!name || typeof name !== "string" || !name.trim())) {
    return NextResponse.json({ error: "Branch name cannot be empty" }, { status: 400 });
  }

  if (email !== undefined && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  const updateData: Record<string, string | null> = {};
  if (name !== undefined) updateData.name = name.trim();
  if (address !== undefined) updateData.address = address?.trim() || null;
  if (phone !== undefined) updateData.phone = phone?.trim() || null;
  if (email !== undefined) updateData.email = email?.trim() || null;

  const updated = await prisma.branch.update({
    where: { id: branchId },
    data: updateData,
  });

  return NextResponse.json({
    branch: {
      id: updated.id,
      name: updated.name,
      address: updated.address,
      phone: updated.phone,
      email: updated.email,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId } = await params;

  // Check branch exists
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  // Check caller is OWNER
  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId } },
  });

  if (!membership || membership.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.branch.delete({ where: { id: branchId } });

  return NextResponse.json({ success: true });
}
