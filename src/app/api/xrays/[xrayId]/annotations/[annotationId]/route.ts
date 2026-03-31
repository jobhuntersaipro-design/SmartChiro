import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MAX_CANVAS_STATE_SIZE = 10 * 1024 * 1024; // 10 MB
const WARN_CANVAS_STATE_SIZE = 5 * 1024 * 1024; // 5 MB

type RouteParams = { params: Promise<{ xrayId: string; annotationId: string }> };

// GET /api/xrays/{xrayId}/annotations/{annotationId} — full annotation with canvasState
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { annotationId } = await params;

  try {
    const annotation = await prisma.annotation.findUnique({
      where: { id: annotationId },
    });

    if (!annotation) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Annotation not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ annotation });
  } catch (error) {
    console.error("Failed to fetch annotation:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch annotation." },
      { status: 500 }
    );
  }
}

// PUT /api/xrays/{xrayId}/annotations/{annotationId} — update annotation
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { annotationId } = await params;

  try {
    const body = await request.json();
    const { label, canvasState, imageAdjustments } = body;

    if (!canvasState) {
      return NextResponse.json(
        { error: "MISSING_CANVAS_STATE", message: "canvasState is required." },
        { status: 400 }
      );
    }

    const canvasStateSize = Buffer.byteLength(JSON.stringify(canvasState), "utf8");
    if (canvasStateSize > MAX_CANVAS_STATE_SIZE) {
      return NextResponse.json(
        { error: "CANVAS_STATE_TOO_LARGE", message: "Annotation data exceeds 10 MB limit." },
        { status: 400 }
      );
    }

    const existing = await prisma.annotation.findUnique({
      where: { id: annotationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Annotation not found." },
        { status: 404 }
      );
    }

    const annotation = await prisma.annotation.update({
      where: { id: annotationId },
      data: {
        label: label !== undefined ? label : undefined,
        canvasState,
        canvasStateSize,
        imageAdjustments: imageAdjustments ?? undefined,
        version: { increment: 1 },
      },
    });

    return NextResponse.json({
      annotation,
      warning:
        canvasStateSize > WARN_CANVAS_STATE_SIZE
          ? "Annotation file is getting large. Consider simplifying some shapes."
          : undefined,
    });
  } catch (error) {
    console.error("Failed to update annotation:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to update annotation." },
      { status: 500 }
    );
  }
}

// DELETE /api/xrays/{xrayId}/annotations/{annotationId} — hard delete
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { annotationId } = await params;

  try {
    const existing = await prisma.annotation.findUnique({
      where: { id: annotationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Annotation not found." },
        { status: 404 }
      );
    }

    await prisma.annotation.delete({ where: { id: annotationId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete annotation:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to delete annotation." },
      { status: 500 }
    );
  }
}
