import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const xrays = await prisma.xray.findMany({
    where: {
      uploadedById: userId,
      status: "READY",
    },
    include: {
      patient: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return NextResponse.json({
    xrays: xrays.map((x) => ({
      id: x.id,
      patientId: x.patientId,
      title: x.title,
      fileUrl: x.thumbnailUrl ?? x.fileUrl,
      patientName: `${x.patient.firstName} ${x.patient.lastName}`,
      createdAt: x.createdAt.toISOString(),
    })),
  });
}
