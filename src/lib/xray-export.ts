import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadToR2, getPresignedDownloadUrl, buildExportKey } from "@/lib/r2";
import { renderAnnotatedPng, renderAnnotatedPdf } from "@/lib/export-renderer";
import type { AnnotationCanvasState, ImageAdjustments } from "@/types/annotation";
import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";

export interface ExportOptions {
  format: "png" | "pdf";
  includeAdjustments: boolean;
  dpi: number;
}

/** Validate an export request body; null when the format is missing or unsupported. */
export function parseExportOptions(body: unknown): ExportOptions | null {
  const b = (body ?? {}) as { format?: unknown; includeAdjustments?: unknown; dpi?: unknown };
  if (b.format !== "png" && b.format !== "pdf") return null;
  const dpi = typeof b.dpi === "number" && Number.isFinite(b.dpi) ? b.dpi : 150;
  return {
    format: b.format,
    includeAdjustments: b.includeAdjustments === true,
    dpi: Math.min(300, Math.max(72, dpi)),
  };
}

export const INVALID_FORMAT_RESPONSE = { error: "INVALID_FORMAT", message: "Supported formats: png, pdf." };

/**
 * Render the X-ray (with whatever shapes/adjustments are passed — none for a
 * film that was never annotated), store it in R2 and return a 24h download
 * link. Callers do auth first.
 */
export async function exportXray(
  xrayId: string,
  canvasState: AnnotationCanvasState,
  adjustments: ImageAdjustments | null,
  options: ExportOptions,
): Promise<NextResponse> {
  const xray = await prisma.xray.findUnique({
    where: { id: xrayId },
    include: {
      patient: {
        select: {
          firstName: true,
          lastName: true,
          branchId: true,
          branch: { select: { name: true } },
        },
      },
    },
  });

  if (!xray) {
    return NextResponse.json({ error: "NOT_FOUND", message: "X-ray not found." }, { status: 404 });
  }

  const imageResponse = await fetch(xray.fileUrl);
  if (!imageResponse.ok) {
    return NextResponse.json(
      { error: "EXPORT_FAILED", message: "Failed to load original image." },
      { status: 500 },
    );
  }
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const imageWidth = xray.width ?? 1024;
  const imageHeight = xray.height ?? 768;
  const { format, includeAdjustments, dpi } = options;

  let outputBuffer: Buffer;
  let contentType: string;
  if (format === "png") {
    outputBuffer = await renderAnnotatedPng(
      imageBuffer,
      canvasState,
      imageWidth,
      imageHeight,
      includeAdjustments,
      adjustments,
    );
    contentType = "image/png";
  } else {
    const exportDate = new Date().toLocaleDateString("en-US", {
      timeZone: CLINIC_TIME_ZONE,
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
      dpi,
      {
        patientName: `${xray.patient.firstName} ${xray.patient.lastName}`,
        xrayTitle: xray.title ?? "Untitled X-ray",
        branchName: xray.patient.branch.name,
        exportDate,
      },
    );
    contentType = "application/pdf";
  }

  const exportId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const exportKey = buildExportKey(xray.patient.branchId, xray.patientId, xrayId, exportId, format);
  await uploadToR2(exportKey, outputBuffer, contentType);

  // Presigned download URL (24h)
  const downloadUrl = await getPresignedDownloadUrl(exportKey, 86400);

  const titleSlug = (xray.title ?? "xray")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return NextResponse.json({
    downloadUrl,
    expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
    fileName: `${titleSlug}-annotated.${format}`,
    fileSize: outputBuffer.length,
  });
}
