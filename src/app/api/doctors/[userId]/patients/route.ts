import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

  // Verify target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, branchMemberships: { select: { branchId: true } } },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Caller must share at least one branch with target
  if (session.user.id !== userId) {
    const callerBranches = await prisma.branchMember.findMany({
      where: { userId: session.user.id },
      select: { branchId: true },
    });
    const callerBranchIds = new Set(callerBranches.map((m) => m.branchId));
    const shared = targetUser.branchMemberships.some((m) =>
      callerBranchIds.has(m.branchId)
    );
    if (!shared) {
      return NextResponse.json({ error: "Forbidden: no shared branch" }, { status: 403 });
    }
  }

  // Build where clause
  const where: Record<string, unknown> = { doctorId: userId };

  if (status === "active") {
    where.status = "active";
  } else if (status === "inactive") {
    where.status = "inactive";
  }

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { icNumber: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ];
  }

  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      include: {
        visits: { orderBy: { visitDate: "desc" }, take: 1, select: { visitDate: true } },
        _count: { select: { xrays: true, visits: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.patient.count({ where }),
  ]);

  return NextResponse.json({
    patients: patients.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      icNumber: p.icNumber,
      phone: p.phone,
      gender: p.gender,
      status: p.status,
      lastVisit: p.visits[0]?.visitDate?.toISOString() ?? null,
      visitCount: p._count.visits,
      xrayCount: p._count.xrays,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
