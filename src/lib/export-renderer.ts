import sharp from "sharp";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type {
  AnnotationCanvasState,
  ImageAdjustments,
  BaseShape,
  Point,
} from "@/types/annotation";
import { measurementText, recomputeShapeDerived, resolveShapeRefs } from "@/lib/measurements";

/**
 * Shapes as the viewer shows them: linked vertices resolved, readings
 * recomputed from the points, and lengths in mm when the film is calibrated.
 */
export function shapesForExport(shapes: BaseShape[], pixelsPerMm: number | null | undefined): BaseShape[] {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  return shapes.map((original) => {
    const shape = recomputeShapeDerived(resolveShapeRefs(original, byId));
    const text = measurementText(shape, pixelsPerMm);
    return shape.measurement && text ? { ...shape, measurement: { ...shape.measurement, label: text } } : shape;
  });
}

// ─── SVG Rendering Helpers ───

function pointsToSvgPath(points: Point[], closed = false): string {
  if (points.length === 0) return "";
  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i++) {
    parts.push(`L ${points[i].x} ${points[i].y}`);
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

function shapeToSvg(shape: BaseShape, labelSize: number): string {
  if (!shape.visible) return "";
  const label = (text: string, x: number, y: number, anchor: "start" | "middle" = "start", color = shape.style.strokeColor) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${labelSize}" fill="${color}" stroke="#000" stroke-width="${labelSize / 8}" paint-order="stroke" font-family="Arial, sans-serif">${escapeXml(text)}</text>`;

  const stroke = shape.style.strokeColor;
  const strokeWidth = shape.style.strokeWidth;
  const strokeOpacity = shape.style.strokeOpacity;
  const fill = shape.style.fillColor ?? "none";
  const fillOpacity = shape.style.fillOpacity;
  const dashArray =
    shape.style.lineDash.length > 0
      ? `stroke-dasharray="${shape.style.lineDash.join(" ")}"`
      : "";

  const strokeAttrs = `stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" ${dashArray}`;
  const commonAttrs = `${strokeAttrs} fill="${fill}" fill-opacity="${fillOpacity}"`;

  switch (shape.type) {
    case "point":
    case "landmark": {
      if (shape.points.length < 1) return "";
      const p = shape.points[0];
      const r = labelSize / 2;
      let svg = `<circle cx="${p.x}" cy="${p.y}" r="${r}" ${strokeAttrs} fill="${stroke}" fill-opacity="0.35" />`;
      const name = shape.label ?? (shape.type === "landmark" ? shape.landmarkName?.replace(/_/g, " ") : null);
      if (name) svg += label(name, p.x + r * 1.6, p.y + r * 0.6);
      return svg;
    }

    case "arrow": {
      if (shape.points.length < 2) return "";
      const [p1, p2] = shape.points;
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      let svg = `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" ${strokeAttrs} />`;
      if (len > 0) {
        const size = shape.arrowSize ?? Math.max(10, strokeWidth * 4);
        const ux = (p2.x - p1.x) / len;
        const uy = (p2.y - p1.y) / len;
        const head = (tip: { x: number; y: number }, dir: number) => {
          const bx = tip.x - ux * size * dir;
          const by = tip.y - uy * size * dir;
          return `<polygon points="${tip.x},${tip.y} ${bx - uy * size * 0.5},${by + ux * size * 0.5} ${bx + uy * size * 0.5},${by - ux * size * 0.5}" fill="${stroke}" fill-opacity="${strokeOpacity}" />`;
        };
        if (shape.arrowEnd !== false) svg += head(p2, 1);
        if (shape.arrowStart) svg += head(p1, -1);
      }
      return svg;
    }

    case "polyline": {
      if (shape.points.length < 2) return "";
      let svg = `<path d="${pointsToSvgPath(shape.points, !!shape.closed)}" ${strokeAttrs} fill="none" />`;
      if (shape.measurement) {
        const last = shape.points[shape.points.length - 1];
        svg += label(shape.measurement.label, last.x + labelSize / 2, last.y - labelSize / 2);
      }
      return svg;
    }

    case "line":
    case "ruler":
    case "calibration": {
      if (shape.points.length < 2) return "";
      const p1 = shape.points[0];
      const p2 = shape.points[1];
      let svg = `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" ${commonAttrs} />`;

      // Add measurement label if present
      if (shape.measurement) {
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2 - labelSize / 2;
        svg += label(shape.measurement.label, mx, my, "middle");
      }

      // End ticks for ruler / calibration
      if (shape.showEndTicks !== false && (shape.type === "ruler" || shape.type === "calibration")) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          const tickLen = shape.tickLength ?? 8;
          const nx = -dy / len;
          const ny = dx / len;
          svg += `<line x1="${p1.x + nx * tickLen}" y1="${p1.y + ny * tickLen}" x2="${p1.x - nx * tickLen}" y2="${p1.y - ny * tickLen}" ${commonAttrs} />`;
          svg += `<line x1="${p2.x + nx * tickLen}" y1="${p2.y + ny * tickLen}" x2="${p2.x - nx * tickLen}" y2="${p2.y - ny * tickLen}" ${commonAttrs} />`;
        }
      }
      return svg;
    }

    case "freehand": {
      return `<path d="${pointsToSvgPath(shape.points, false)}" ${strokeAttrs} fill="none" fill-opacity="${fillOpacity}" />`;
    }

    case "text": {
      const fontSize = shape.fontSize ?? 16;
      const fontWeight = shape.fontWeight ?? 400;
      return `<text x="${shape.x}" y="${shape.y + fontSize}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${stroke}" fill-opacity="${strokeOpacity}" font-family="Arial, sans-serif">${escapeXml(shape.text ?? "")}</text>`;
    }

    case "angle": {
      if (shape.points.length < 3) return "";
      const path = pointsToSvgPath(shape.points);
      let svg = `<path d="${path}" ${strokeAttrs} fill="none" />`;
      if (shape.measurement) {
        const vertex = shape.points[1];
        svg += label(shape.measurement.label, vertex.x + labelSize, vertex.y - labelSize / 3);
      }
      return svg;
    }

    case "cobb_angle": {
      let svg = "";
      if (shape.line1) {
        svg += `<line x1="${shape.line1[0]}" y1="${shape.line1[1]}" x2="${shape.line1[2]}" y2="${shape.line1[3]}" ${commonAttrs} />`;
      }
      if (shape.line2) {
        svg += `<line x1="${shape.line2[0]}" y1="${shape.line2[1]}" x2="${shape.line2[2]}" y2="${shape.line2[3]}" ${commonAttrs} />`;
      }
      if (shape.showPerpendiculars && shape.perpendicular1) {
        svg += `<line x1="${shape.perpendicular1[0]}" y1="${shape.perpendicular1[1]}" x2="${shape.perpendicular1[2]}" y2="${shape.perpendicular1[3]}" ${commonAttrs} stroke-dasharray="4 4" />`;
      }
      if (shape.showPerpendiculars && shape.perpendicular2) {
        svg += `<line x1="${shape.perpendicular2[0]}" y1="${shape.perpendicular2[1]}" x2="${shape.perpendicular2[2]}" y2="${shape.perpendicular2[3]}" ${commonAttrs} stroke-dasharray="4 4" />`;
      }
      if (shape.measurement && shape.intersection) {
        svg += label(shape.measurement.label, shape.intersection[0] + labelSize, shape.intersection[1] - labelSize / 3);
      }
      return svg;
    }

    default:
      return "";
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildAnnotationSvg(
  shapes: BaseShape[],
  width: number,
  height: number
): string {
  const sortedShapes = [...shapes].sort((a, b) => a.zIndex - b.zIndex);
  // Readable on a full-resolution film: ~1/110 of the long side, at least 12px.
  const labelSize = Math.max(12, Math.round(Math.max(width, height) / 110));
  const shapesSvg = sortedShapes.map((shape) => shapeToSvg(shape, labelSize)).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${shapesSvg}
</svg>`;
}

// ─── Image Adjustment Helpers ───

function applyAdjustments(
  pipeline: sharp.Sharp,
  adjustments: ImageAdjustments
): sharp.Sharp {
  let result = pipeline;

  // Brightness: map -100..100 to 0.5..1.5
  if (adjustments.brightness !== 0) {
    const factor = 1 + adjustments.brightness / 100;
    result = result.modulate({ brightness: factor });
  }

  // Contrast: use linear adjustment
  if (adjustments.contrast !== 0) {
    const factor = 1 + adjustments.contrast / 100;
    result = result.linear(factor, -(128 * factor) + 128);
  }

  // Invert
  if (adjustments.invert) {
    result = result.negate({ alpha: false });
  }

  return result;
}

// ─── Export Functions ───

export async function renderAnnotatedPng(
  imageBuffer: Buffer,
  canvasState: AnnotationCanvasState,
  imageWidth: number,
  imageHeight: number,
  includeAdjustments: boolean,
  adjustments: ImageAdjustments | null
): Promise<Buffer> {
  // .rotate() applies the EXIF orientation first, so a phone photo isn't exported sideways.
  let pipeline = sharp(imageBuffer).rotate().resize(imageWidth, imageHeight, { fit: "inside" });

  if (includeAdjustments && adjustments) {
    pipeline = applyAdjustments(pipeline, adjustments);
  }

  // Ensure we have PNG output for compositing
  pipeline = pipeline.png();

  // Render annotations as SVG overlay
  const visibleShapes = shapesForExport(canvasState.shapes, adjustments?.pixelsPerMm).filter((s) => s.visible);
  if (visibleShapes.length > 0) {
    const svgOverlay = buildAnnotationSvg(visibleShapes, imageWidth, imageHeight);
    const svgBuffer = Buffer.from(svgOverlay);

    pipeline = pipeline.composite([{ input: svgBuffer, top: 0, left: 0 }]);
  }

  return pipeline.toBuffer();
}

export async function renderAnnotatedPdf(
  imageBuffer: Buffer,
  canvasState: AnnotationCanvasState,
  imageWidth: number,
  imageHeight: number,
  includeAdjustments: boolean,
  adjustments: ImageAdjustments | null,
  dpi: number,
  metadata: {
    patientName: string;
    xrayTitle: string;
    branchName: string;
    exportDate: string;
  }
): Promise<Buffer> {
  // First render the annotated PNG
  const pngBuffer = await renderAnnotatedPng(
    imageBuffer,
    canvasState,
    imageWidth,
    imageHeight,
    includeAdjustments,
    adjustments
  );

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Page 1: Image with header/footer
  const headerHeight = 60;
  const footerHeight = 40;
  const margin = 36; // 0.5 inch at 72 dpi

  // Scale image to fit within page at requested DPI
  const scaleFactor = 72 / dpi; // PDF points per pixel
  const pageImageWidth = imageWidth * scaleFactor;
  const pageImageHeight = imageHeight * scaleFactor;
  const pageWidth = pageImageWidth + margin * 2;
  const pageHeight = pageImageHeight + headerHeight + footerHeight + margin * 2;

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  const pngImage = await pdfDoc.embedPng(pngBuffer);

  // Header
  const headerY = pageHeight - headerHeight;
  page.drawText(metadata.patientName, {
    x: margin,
    y: headerY + 25,
    size: 14,
    font: fontBold,
    color: rgb(0.04, 0.15, 0.25),
  });
  page.drawText(`${metadata.xrayTitle}  |  ${metadata.branchName}  |  ${metadata.exportDate}`, {
    x: margin,
    y: headerY + 8,
    size: 9,
    font,
    color: rgb(0.26, 0.33, 0.4),
  });

  // Draw line under header
  page.drawLine({
    start: { x: margin, y: headerY },
    end: { x: pageWidth - margin, y: headerY },
    thickness: 0.5,
    color: rgb(0.89, 0.91, 0.93),
  });

  // Image
  page.drawImage(pngImage, {
    x: margin,
    y: footerHeight + margin,
    width: pageImageWidth,
    height: pageImageHeight,
  });

  // Footer
  page.drawLine({
    start: { x: margin, y: footerHeight + margin - 8 },
    end: { x: pageWidth - margin, y: footerHeight + margin - 8 },
    thickness: 0.5,
    color: rgb(0.89, 0.91, 0.93),
  });
  page.drawText(`Generated by SmartChiro  |  ${metadata.exportDate}`, {
    x: margin,
    y: 16,
    size: 8,
    font,
    color: rgb(0.41, 0.45, 0.53),
  });

  // Page 2: Measurement summary (if measurements exist)
  const measurements = shapesForExport(canvasState.shapes, adjustments?.pixelsPerMm).filter(
    (s) => s.visible && s.measurement && ["ruler", "angle", "cobb_angle"].includes(s.type)
  );

  if (measurements.length > 0) {
    const summaryPage = pdfDoc.addPage([pageWidth, 792]); // standard-ish height
    let y = 792 - margin;

    summaryPage.drawText("Measurement Summary", {
      x: margin,
      y,
      size: 16,
      font: fontBold,
      color: rgb(0.04, 0.15, 0.25),
    });
    y -= 30;

    // Table header
    const col1 = margin;
    const col2 = margin + 200;
    const col3 = margin + 340;

    summaryPage.drawText("Measurement", { x: col1, y, size: 10, font: fontBold, color: rgb(0.41, 0.45, 0.53) });
    summaryPage.drawText("Value", { x: col2, y, size: 10, font: fontBold, color: rgb(0.41, 0.45, 0.53) });
    summaryPage.drawText("Type", { x: col3, y, size: 10, font: fontBold, color: rgb(0.41, 0.45, 0.53) });
    y -= 4;

    summaryPage.drawLine({
      start: { x: col1, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: rgb(0.89, 0.91, 0.93),
    });
    y -= 18;

    for (const shape of measurements) {
      if (y < margin + 40) break; // prevent overflow
      const label = shape.label ?? shape.type;
      const value = shape.measurement?.label ?? "—";
      const type = shape.type.replace("_", " ");

      summaryPage.drawText(label, { x: col1, y, size: 10, font, color: rgb(0.04, 0.15, 0.25) });
      summaryPage.drawText(value, { x: col2, y, size: 10, font, color: rgb(0.04, 0.15, 0.25) });
      summaryPage.drawText(type, { x: col3, y, size: 10, font, color: rgb(0.41, 0.45, 0.53) });
      y -= 20;
    }

    // Footer on summary page
    summaryPage.drawText(`Generated by SmartChiro  |  ${metadata.exportDate}`, {
      x: margin,
      y: 16,
      size: 8,
      font,
      color: rgb(0.41, 0.45, 0.53),
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
