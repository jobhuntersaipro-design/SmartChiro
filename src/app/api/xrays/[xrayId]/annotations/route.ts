import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MAX_CANVAS_STATE_SIZE = 10 * 1024 * 1024; // 10 MB

// GET /api/xrays/{xrayId}/annotations — list annotation summaries
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> }
) {
  const { xrayId } = await params;

  try {
    const xray = await prisma.xray.findUnique({
      where: { id: xrayId },
      select: { id: true },
    });

    if (!xray) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "X-ray not found." },
        { status: 404 }
      );
    }

    const annotations = await prisma.annotation.findMany({
      where: { xrayId },
      select: {
        id: true,
        label: true,
        version: true,
        thumbnailUrl: true,
        canvasStateSize: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ annotations });
  } catch (error) {
    console.error("Failed to list annotations:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to list annotations." },
      { status: 500 }
    );
  }
}

// POST /api/xrays/{xrayId}/annotations — create new annotation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> }
) {
  const { xrayId } = await params;

  try {
    const body = await request.json();
    const { label, canvasState, imageAdjustments, createdById } = body;

    if (!canvasState) {
      return NextResponse.json(
        { error: "MISSING_CANVAS_STATE", message: "canvasState is required." },
        { status: 400 }
      );
    }

    // TODO: Replace createdById with real auth
    if (!createdById) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Authentication required." },
        { status: 401 }
      );
    }

    // Validate canvas state size
    const canvasStateSize = Buffer.byteLength(JSON.stringify(canvasState), "utf8");
    if (canvasStateSize > MAX_CANVAS_STATE_SIZE) {
      return NextResponse.json(
        { error: "CANVAS_STATE_TOO_LARGE", message: "Annotation data exceeds 10 MB limit." },
        { status: 400 }
      );
    }

    // Verify xray exists and is READY
    const xray = await prisma.xray.findUnique({
      where: { id: xrayId },
      select: { id: true, status: true },
    });

    if (!xray) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "X-ray not found." },
        { status: 404 }
      );
    }

    if (xray.status !== "READY") {
      return NextResponse.json(
        { error: "XRAY_NOT_READY", message: "X-ray upload has not been confirmed." },
        { status: 400 }
      );
    }

    const annotation = await prisma.annotation.create({
      data: {
        label: label ?? null,
        canvasState,
        canvasStateSize,
        imageAdjustments: imageAdjustments ?? undefined,
        version: 1,
        xrayId,
        createdById,
      },
    });

    return NextResponse.json({ annotation }, { status: 201 });
  } catch (error) {
    console.error("Failed to create annotation:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to create annotation." },
      { status: 500 }
    );
  }
}
