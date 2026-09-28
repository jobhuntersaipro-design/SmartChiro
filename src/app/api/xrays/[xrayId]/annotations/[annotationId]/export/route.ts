import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageXray } from "@/lib/auth/xray";
import { exportXray, parseExportOptions, INVALID_FORMAT_RESPONSE } from "@/lib/xray-export";
import type { AnnotationCanvasState, ImageAdjustments } from "@/types/annotation";

type RouteParams = { params: Promise<{ xrayId: string; annotationId: string }> };

// POST /api/xrays/{xrayId}/annotations/{annotationId}/export
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { xrayId, annotationId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!(await canManageXray(session.user.id, xrayId))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const options = parseExportOptions(await request.json());
    if (!options) {
      return NextResponse.json(INVALID_FORMAT_RESPONSE, { status: 400 });
    }

    // Load annotation and confirm it belongs to the xrayId in the URL.
    const annotation = await prisma.annotation.findUnique({
      where: { id: annotationId },
    });

    if (!annotation || annotation.xrayId !== xrayId) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    // Adjustments are always passed: calibration labels lengths in mm even
    // when the visual adjustments (brightness etc.) are left out of the export.
    return await exportXray(
      xrayId,
      annotation.canvasState as unknown as AnnotationCanvasState,
      annotation.imageAdjustments as unknown as ImageAdjustments | null,
      options,
    );
  } catch (error) {
    console.error("Export failed:", error);
    return NextResponse.json(
      { error: "EXPORT_FAILED", message: "Export failed. Please try again." },
      { status: 500 }
    );
  }
}
