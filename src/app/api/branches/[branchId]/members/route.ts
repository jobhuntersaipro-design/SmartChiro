import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List members of a branch
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ branchId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId } = await params;

  // Verify caller is a member of this branch
  const callerMembership = await prisma.branchMember.findUnique({
    where: {
      userId_branchId: { userId: session.user.id, branchId },
    },
  });

  if (!callerMembership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await prisma.branchMember.findMany({
    where: { branchId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
    })),
  });
}

// POST: Add a doctor to a branch by email
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ branchId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId } = await params;

  // Verify caller is OWNER or ADMIN of this branch
  const callerMembership = await prisma.branchMember.findUnique({
    where: {
      userId_branchId: { userId: session.user.id, branchId },
    },
  });

  if (!callerMembership || callerMembership.role === "DOCTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { email, role } = body;

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const validRoles = ["DOCTOR", "ADMIN"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user) {
    return NextResponse.json(
      { error: "User not found. They need to register first." },
      { status: 404 }
    );
  }

  // Check if already a member
  const existing = await prisma.branchMember.findUnique({
    where: {
      userId_branchId: { userId: user.id, branchId },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "User is already a member of this branch" },
      { status: 409 }
    );
  }

  const member = await prisma.branchMember.create({
    data: {
      userId: user.id,
      branchId,
      role,
    },
  });

  return NextResponse.json({ member }, { status: 201 });
}
