import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT /api/xrays/{xrayId}/calibrate — set calibration
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> }
) {
  const { xrayId } = await params;

  try {
    const body = await request.json();
    const { pixelsPerMm, calibrationNote } = body;

    // Validate pixelsPerMm
    if (typeof pixelsPerMm !== "number" || pixelsPerMm <= 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "pixelsPerMm must be a positive number." },
        { status: 400 }
      );
    }
    if (pixelsPerMm > 1000) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "pixelsPerMm must be at most 1000." },
        { status: 400 }
      );
    }

    // Validate calibrationNote
    if (calibrationNote !== undefined && typeof calibrationNote !== "string") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "calibrationNote must be a string." },
        { status: 400 }
      );
    }
    if (typeof calibrationNote === "string" && calibrationNote.length > 100) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "calibrationNote must be at most 100 characters." },
        { status: 400 }
      );
    }

    const xray = await prisma.xray.findUnique({ where: { id: xrayId } });
    if (!xray) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "X-ray not found." },
        { status: 404 }
      );
    }

    const updated = await prisma.xray.update({
      where: { id: xrayId },
      data: {
        isCalibrated: true,
        pixelsPerMm,
        calibrationNote: calibrationNote ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        isCalibrated: updated.isCalibrated,
        pixelsPerMm: updated.pixelsPerMm,
        calibrationNote: updated.calibrationNote,
      },
    });
  } catch (error) {
    console.error("Failed to calibrate xray:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to calibrate X-ray." },
      { status: 500 }
    );
  }
}

// DELETE /api/xrays/{xrayId}/calibrate — remove calibration
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

    const updated = await prisma.xray.update({
      where: { id: xrayId },
      data: {
        isCalibrated: false,
        pixelsPerMm: null,
        calibrationNote: null,
      },
    });

    return NextResponse.json({
      success: true,
      data: { id: updated.id, isCalibrated: false },
    });
  } catch (error) {
    console.error("Failed to remove calibration:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to remove calibration." },
      { status: 500 }
    );
  }
}
