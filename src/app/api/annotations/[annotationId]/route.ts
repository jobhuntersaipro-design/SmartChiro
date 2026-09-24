import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { BaseShape } from "@/types/annotation";
import { extractLandmarkCorrections } from "@/lib/landmark-corrections";

const MAX_CANVAS_STATE_SIZE = 10 * 1024 * 1024; // 10 MB hard cap
const WARN_CANVAS_STATE_SIZE = 5 * 1024 * 1024; // 5 MB warning

/**
 * Persist any AI-landmark drag corrections from the saved canvasState into
 * the AiLandmarkCorrection table. Each row is keyed on (xrayId,
 * landmarkName) and upserted so the latest user-corrected position wins.
 *
 * Fail-soft: any error here is logged but never propagates — the annotation
 * save itself must succeed even if the learning-data write fails (Xray width
 * missing, transient DB issue, etc.).
 */
async function captureLandmarkCorrections(
  annotationId: string,
  canvasState: { shapes?: BaseShape[] },
) {
  try {
    const shapes = canvasState.shapes ?? [];
    const rows = extractLandmarkCorrections(shapes);
    if (rows.length === 0) return;

    const annotation = await prisma.annotation.findUnique({
      where: { id: annotationId },
      select: {
        createdById: true,
        xrayId: true,
        xray: { select: { width: true, height: true } },
      },
    });
    if (!annotation || !annotation.xray.width || !annotation.xray.height) return;

    const { xrayId, createdById, xray } = annotation;
    // upsert one row per (xrayId, landmarkName). Sequential is fine — N≤16
    // landmarks per X-ray, so the overhead is negligible vs the gain of
    // straightforward error handling.
    for (const row of rows) {
      await prisma.aiLandmarkCorrection.upsert({
        where: {
          xrayId_landmarkName: { xrayId, landmarkName: row.landmarkName },
        },
        update: {
          userId: createdById,
          displayName: row.displayName,
          finalX: row.finalX,
          finalY: row.finalY,
          imageWidth: xray.width!,
          imageHeight: xray.height!,
        },
        create: {
          xrayId,
          userId: createdById,
          landmarkName: row.landmarkName,
          displayName: row.displayName,
          aiX: row.aiX,
          aiY: row.aiY,
          finalX: row.finalX,
          finalY: row.finalY,
          imageWidth: xray.width!,
          imageHeight: xray.height!,
        },
      });
    }
  } catch (err) {
    console.error("Failed to capture landmark corrections (fail-soft):", err);
  }
}

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

    // Side-channel: capture any AI-landmark corrections the user just made.
    // Awaited so the request can be observed by tests, but fail-soft so it
    // never blocks the annotation save.
    await captureLandmarkCorrections(annotationId, canvasState);

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
