import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageXray } from "@/lib/auth/xray";

const ALLOWED_BODY_REGIONS = [
  "CERVICAL",
  "THORACIC",
  "LUMBAR",
  "PELVIS",
  "FULL_SPINE",
  "EXTREMITY",
  "OTHER",
] as const;
const ALLOWED_VIEW_TYPES = [
  "AP",
  "LATERAL",
  "OBLIQUE",
  "FLEXION",
  "EXTENSION",
  "OTHER",
] as const;
const ALLOWED_STATUSES = ["READY", "ARCHIVED"] as const; // UPLOADING is set by upload, not PATCHable

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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Sign-in required." },
      { status: 401 }
    );
  }

  if (!(await canManageXray(session.user.id, xrayId))) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "X-ray not found." },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const { title, bodyRegion, viewType, status } = body;

    const data: Record<string, unknown> = {};
    if (title !== undefined)
      data.title = typeof title === "string" ? title.slice(0, 200) : null;
    if (bodyRegion !== undefined) {
      if (bodyRegion !== null && !ALLOWED_BODY_REGIONS.includes(bodyRegion)) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Invalid bodyRegion." },
          { status: 400 }
        );
      }
      data.bodyRegion = bodyRegion;
    }
    if (viewType !== undefined) {
      if (viewType !== null && !ALLOWED_VIEW_TYPES.includes(viewType)) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Invalid viewType." },
          { status: 400 }
        );
      }
      data.viewType = viewType;
    }
    if (status !== undefined) {
      if (!ALLOWED_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Invalid status." },
          { status: 400 }
        );
      }
      data.status = status;
    }

    const updated = await prisma.xray.update({ where: { id: xrayId }, data });
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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Sign-in required." },
      { status: 401 }
    );
  }

  if (!(await canManageXray(session.user.id, xrayId))) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "X-ray not found." },
      { status: 404 }
    );
  }

  try {
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
