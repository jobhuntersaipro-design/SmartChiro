import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ branchId: string }> };

export async function GET(
  req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId } = await params;
  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search") || "";
  const doctorId = searchParams.get("doctorId") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

  // Check membership
  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build where clause
  const where: Record<string, unknown> = { branchId };

  if (doctorId) {
    where.doctorId = doctorId;
  }

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ];
  }

  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      include: {
        doctor: { select: { id: true, name: true } },
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
      email: p.email,
      phone: p.phone,
      doctor: p.doctor ? { id: p.doctor.id, name: p.doctor.name } : null,
      lastVisitDate: p.visits[0]?.visitDate?.toISOString() ?? null,
      xrayCount: p._count.xrays,
      visitCount: p._count.visits,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
