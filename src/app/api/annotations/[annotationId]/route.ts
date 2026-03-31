import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MAX_CANVAS_STATE_SIZE = 10 * 1024 * 1024; // 10 MB hard cap
const WARN_CANVAS_STATE_SIZE = 5 * 1024 * 1024; // 5 MB warning

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ annotationId: string }> }
) {
  const { annotationId } = await params;

  try {
    const body = await request.json();
    const { canvasState, canvasStateSize, imageAdjustments } = body;

    if (!canvasState) {
      return NextResponse.json(
        { error: "canvasState is required" },
        { status: 400 }
      );
    }

    if (canvasStateSize > MAX_CANVAS_STATE_SIZE) {
      return NextResponse.json(
        { error: "Canvas state exceeds maximum size of 10 MB" },
        { status: 413 }
      );
    }

    const annotation = await prisma.annotation.update({
      where: { id: annotationId },
      data: {
        canvasState,
        canvasStateSize: canvasStateSize ?? 0,
        imageAdjustments: imageAdjustments ?? undefined,
        version: { increment: 1 },
      },
    });

    return NextResponse.json({
      success: true,
      id: annotation.id,
      version: annotation.version,
      warning:
        canvasStateSize > WARN_CANVAS_STATE_SIZE
          ? "Canvas state is approaching the 10 MB limit"
          : undefined,
    });
  } catch (error) {
    console.error("Failed to save annotation:", error);
    return NextResponse.json(
      { error: "Failed to save annotation" },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ annotationId: string }> }
) {
  const { annotationId } = await params;

  try {
    const annotation = await prisma.annotation.findUnique({
      where: { id: annotationId },
    });

    if (!annotation) {
      return NextResponse.json(
        { error: "Annotation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(annotation);
  } catch (error) {
    console.error("Failed to fetch annotation:", error);
    return NextResponse.json(
      { error: "Failed to fetch annotation" },
      { status: 500 }
    );
  }
}
