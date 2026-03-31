import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ xrayId: string; annotationId: string }> };

// POST /api/xrays/{xrayId}/annotations/{annotationId}/fork — copy annotation
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { xrayId, annotationId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const { createdById } = body as { createdById?: string };

    // TODO: Replace with real auth
    if (!createdById) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Authentication required." },
        { status: 401 }
      );
    }

    const source = await prisma.annotation.findUnique({
      where: { id: annotationId },
    });

    if (!source) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Annotation not found." },
        { status: 404 }
      );
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
        createdById,
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
