import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, address, phone, email } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Branch name is required" }, { status: 400 });
  }

  const userId = session.user.id;

  // Create branch and add user as OWNER
  const branch = await prisma.branch.create({
    data: {
      name: name.trim(),
      address: address || null,
      phone: phone || null,
      email: email || null,
      members: {
        create: {
          userId,
          role: "OWNER",
        },
      },
    },
  });

  // Set as active branch if user doesn't have one
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeBranchId: true },
  });

  if (!user?.activeBranchId) {
    await prisma.user.update({
      where: { id: userId },
      data: { activeBranchId: branch.id },
    });
  }

  return NextResponse.json({ branch }, { status: 201 });
}
