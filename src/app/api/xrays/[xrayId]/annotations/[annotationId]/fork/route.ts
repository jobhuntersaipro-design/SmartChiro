import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageXray } from "@/lib/auth/xray";

type RouteParams = { params: Promise<{ xrayId: string; annotationId: string }> };

// POST /api/xrays/{xrayId}/annotations/{annotationId}/fork — copy annotation
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { xrayId, annotationId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!(await canManageXray(session.user.id, xrayId))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const source = await prisma.annotation.findUnique({
      where: { id: annotationId },
    });

    // Confirm the source belongs to the xrayId in the URL — prevents forking
    // an annotation from another xray under a spoofed URL segment.
    if (!source || source.xrayId !== xrayId) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const newLabel = source.label ? `${source.label} (copy)` : "Annotation (copy)";

    const annotation = await prisma.annotation.create({
      data: {
        label: newLabel,
        canvasState: source.canvasState as object,
        canvasStateSize: source.canvasStateSize,
        imageAdjustments: source.imageAdjustments as object | undefined,
        version: 1,
        xrayId,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ annotation }, { status: 201 });
  } catch (error) {
    console.error("Failed to fork annotation:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fork annotation." },
      { status: 500 }
    );
  }
}
