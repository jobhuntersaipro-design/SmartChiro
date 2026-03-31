import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadToR2, getPresignedDownloadUrl, buildExportKey } from "@/lib/r2";
import { renderAnnotatedPng, renderAnnotatedPdf } from "@/lib/export-renderer";
import type { AnnotationCanvasState, ImageAdjustments } from "@/types/annotation";

type RouteParams = { params: Promise<{ xrayId: string; annotationId: string }> };

// POST /api/xrays/{xrayId}/annotations/{annotationId}/export
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { xrayId, annotationId } = await params;

  try {
    const body = await request.json();
    const { format, includeAdjustments = false, dpi = 150 } = body;

    // Validate format
    if (!format || !["png", "pdf"].includes(format)) {
      return NextResponse.json(
        { error: "INVALID_FORMAT", message: "Supported formats: png, pdf." },
        { status: 400 }
      );
    }

    // Validate DPI for PDF
    const clampedDpi = Math.min(300, Math.max(72, dpi));

    // Load annotation
    const annotation = await prisma.annotation.findUnique({
      where: { id: annotationId },
    });

    if (!annotation) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Annotation not found." },
        { status: 404 }
      );
    }

    // Load xray with patient and clinic info
    const xray = await prisma.xray.findUnique({
      where: { id: xrayId },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            clinicId: true,
            clinic: { select: { name: true } },
          },
        },
      },
    });

    if (!xray) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "X-ray not found." },
        { status: 404 }
      );
    }

    // Fetch the original image from R2
    const imageResponse = await fetch(xray.fileUrl);
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: "EXPORT_FAILED", message: "Failed to load original image." },
        { status: 500 }
      );
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    const canvasState = annotation.canvasState as unknown as AnnotationCanvasState;
    const adjustments = includeAdjustments
      ? (annotation.imageAdjustments as unknown as ImageAdjustments | null)
      : null;
    const imageWidth = xray.width ?? 1024;
    const imageHeight = xray.height ?? 768;

    let outputBuffer: Buffer;
    let contentType: string;
    let ext: "png" | "pdf";

    if (format === "png") {
      outputBuffer = await renderAnnotatedPng(
        imageBuffer,
        canvasState,
        imageWidth,
        imageHeight,
        includeAdjustments,
        adjustments
      );
      contentType = "image/png";
      ext = "png";
    } else {
      const exportDate = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      outputBuffer = await renderAnnotatedPdf(
        imageBuffer,
        canvasState,
        imageWidth,
        imageHeight,
        includeAdjustments,
        adjustments,
        clampedDpi,
        {
          patientName: `${xray.patient.firstName} ${xray.patient.lastName}`,
          xrayTitle: xray.title ?? "Untitled X-ray",
          clinicName: xray.patient.clinic.name,
          exportDate,
        }
      );
      contentType = "application/pdf";
      ext = "pdf";
    }

    // Generate a unique export ID
    const exportId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Upload to R2
    const exportKey = buildExportKey(
      xray.patient.clinicId,
      xray.patientId,
      xrayId,
      exportId,
      ext
    );
    await uploadToR2(exportKey, outputBuffer, contentType);

    // Generate presigned download URL (24h)
    const downloadUrl = await getPresignedDownloadUrl(exportKey, 86400);

    // Build filename
    const titleSlug = (xray.title ?? "xray")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const fileName = `${titleSlug}-annotated.${ext}`;

    const expiresAt = new Date(Date.now() + 86400 * 1000).toISOString();

    return NextResponse.json({
      downloadUrl,
      expiresAt,
      fileName,
      fileSize: outputBuffer.length,
    });
  } catch (error) {
    console.error("Export failed:", error);
    return NextResponse.json(
      { error: "EXPORT_FAILED", message: "Export failed. Please try again." },
      { status: 500 }
    );
  }
}
