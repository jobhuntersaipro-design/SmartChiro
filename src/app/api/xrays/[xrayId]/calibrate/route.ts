import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// PUT — Apply or update calibration
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> }
) {
  const { xrayId } = await params;

  const body = await request.json();
  const { pixelSpacing, calibrationMethod } = body as {
    pixelSpacing: number;
    calibrationMethod: "REFERENCE_MARKER" | "MANUAL" | "CLINIC_DEFAULT";
  };

  if (!pixelSpacing || pixelSpacing <= 0) {
    return NextResponse.json(
      { error: "pixelSpacing must be a positive number" },
      { status: 400 }
    );
  }

  const xray = await prisma.xray.findUnique({ where: { id: xrayId } });
  if (!xray) {
    return NextResponse.json({ error: "X-ray not found" }, { status: 404 });
  }

  const updated = await prisma.xray.update({
    where: { id: xrayId },
    data: {
      isCalibrated: true,
      pixelSpacing,
      calibrationMethod: calibrationMethod ?? "REFERENCE_MARKER",
    },
  });

  return NextResponse.json({
    success: true,
    isCalibrated: updated.isCalibrated,
    pixelSpacing: updated.pixelSpacing,
    calibrationMethod: updated.calibrationMethod,
  });
}

// DELETE — Remove calibration
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> }
) {
  const { xrayId } = await params;

  const xray = await prisma.xray.findUnique({ where: { id: xrayId } });
  if (!xray) {
    return NextResponse.json({ error: "X-ray not found" }, { status: 404 });
  }

  const updated = await prisma.xray.update({
    where: { id: xrayId },
    data: {
      isCalibrated: false,
      pixelSpacing: null,
      calibrationMethod: null,
    },
  });

  return NextResponse.json({
    success: true,
    isCalibrated: updated.isCalibrated,
  });
}
