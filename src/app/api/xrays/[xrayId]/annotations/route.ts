import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageXray } from "@/lib/auth/xray";

const MAX_CANVAS_STATE_SIZE = 10 * 1024 * 1024; // 10 MB

// GET /api/xrays/{xrayId}/annotations — list annotation summaries
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> }
) {
  const { xrayId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!(await canManageXray(session.user.id, xrayId))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
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

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!(await canManageXray(session.user.id, xrayId))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { label, canvasState, imageAdjustments } = body;

    if (!canvasState) {
      return NextResponse.json(
        { error: "MISSING_CANVAS_STATE", message: "canvasState is required." },
        { status: 400 }
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

    // Verify xray is READY (existence already checked by canManageXray)
    const xray = await prisma.xray.findUnique({
      where: { id: xrayId },
      select: { status: true },
    });

    if (xray?.status !== "READY") {
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
        createdById: session.user.id,
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
