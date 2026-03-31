import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/xrays/{xrayId} — single xray with annotation summaries
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> }
) {
  const { xrayId } = await params;

  try {
    const xray = await prisma.xray.findUnique({
      where: { id: xrayId },
      include: {
        annotations: {
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
        },
      },
    });

    if (!xray) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "X-ray not found." },
        { status: 404 }
      );
    }

    const { annotations, ...xrayData } = xray;
    return NextResponse.json({ xray: xrayData, annotations });
  } catch (error) {
    console.error("Failed to fetch xray:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch X-ray." },
      { status: 500 }
    );
  }
}

// PATCH /api/xrays/{xrayId} — update metadata
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> }
) {
  const { xrayId } = await params;

  try {
    const body = await request.json();
    const { title, bodyRegion, viewType } = body;

    const xray = await prisma.xray.findUnique({ where: { id: xrayId } });
    if (!xray) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "X-ray not found." },
        { status: 404 }
      );
    }

    // Build update data — only include provided fields
    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (bodyRegion !== undefined) data.bodyRegion = bodyRegion;
    if (viewType !== undefined) data.viewType = viewType;

    const updated = await prisma.xray.update({
      where: { id: xrayId },
      data,
    });

    return NextResponse.json({ xray: updated });
  } catch (error) {
    console.error("Failed to update xray:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to update X-ray." },
      { status: 500 }
    );
  }
}

// DELETE /api/xrays/{xrayId} — soft-delete (archive)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> }
) {
  const { xrayId } = await params;

  try {
    const xray = await prisma.xray.findUnique({ where: { id: xrayId } });
    if (!xray) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "X-ray not found." },
        { status: 404 }
      );
    }

    await prisma.xray.update({
      where: { id: xrayId },
      data: { status: "ARCHIVED" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to archive xray:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to archive X-ray." },
      { status: 500 }
    );
  }
}
