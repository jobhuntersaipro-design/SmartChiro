import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ branchId: string; memberId: string }> };

// GET: Get a single member's details
export async function GET(
  _req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId, memberId } = await params;

  // Verify caller is a member of this branch
  const callerMembership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId } },
  });

  if (!callerMembership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const member = await prisma.branchMember.findUnique({
    where: { id: memberId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  if (!member || member.branchId !== branchId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Count patients assigned to this member in this branch
  const patientCount = await prisma.patient.count({
    where: { doctorId: member.userId, branchId },
  });

  return NextResponse.json({
    member: {
      id: member.id,
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      image: member.user.image,
      role: member.role,
      patientCount,
      joinedAt: member.createdAt.toISOString(),
    },
  });
}

// DELETE: Remove a member from a branch
export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId, memberId } = await params;

  // Verify caller is OWNER or ADMIN of this branch
  const callerMembership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId } },
  });

  if (!callerMembership || callerMembership.role === "DOCTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cannot remove the OWNER
  const targetMember = await prisma.branchMember.findUnique({
    where: { id: memberId },
  });

  if (!targetMember || targetMember.branchId !== branchId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (targetMember.role === "OWNER") {
    return NextResponse.json({ error: "Cannot remove the branch owner" }, { status: 403 });
  }

  try {
    await prisma.branchMember.delete({ where: { id: memberId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}

// PATCH: Update a member's role (including ownership transfer)
export async function PATCH(
  req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId, memberId } = await params;

  // Only OWNER can change roles
  const callerMembership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId } },
  });

  if (!callerMembership || callerMembership.role !== "OWNER") {
    return NextResponse.json({ error: "Only the branch owner can change roles" }, { status: 403 });
  }

  const body = await req.json();
  const { role } = body;

  const validRoles = ["DOCTOR", "ADMIN", "OWNER"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const targetMember = await prisma.branchMember.findUnique({
    where: { id: memberId },
  });

  if (!targetMember || targetMember.branchId !== branchId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Ownership transfer — atomic transaction
  if (role === "OWNER") {
    if (targetMember.role === "OWNER") {
      return NextResponse.json({ error: "Member is already the owner" }, { status: 400 });
    }

    const [updated] = await prisma.$transaction([
      prisma.branchMember.update({
        where: { id: memberId },
        data: { role: "OWNER" },
      }),
      prisma.branchMember.update({
        where: { id: callerMembership.id },
        data: { role: "ADMIN" },
      }),
    ]);

    return NextResponse.json({ member: updated });
  }

  // Cannot change the owner's own role (non-transfer)
  if (targetMember.role === "OWNER") {
    return NextResponse.json({ error: "Cannot change the owner's role" }, { status: 403 });
  }

  const updated = await prisma.branchMember.update({
    where: { id: memberId },
    data: { role },
  });

  return NextResponse.json({ member: updated });
}
