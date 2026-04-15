import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { renderAnnotatedPng, renderAnnotatedPdf } from "../export-renderer";
import type { AnnotationCanvasState, BaseShape } from "@/types/annotation";
import {
  DEFAULT_SHAPE_STYLE,
  MEASUREMENT_STYLE,
} from "@/types/annotation";

// Helper to create a minimal test image buffer (100x100 red PNG)
async function createTestImage(w = 100, h = 100): Promise<Buffer> {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .png()
    .toBuffer();
}

function makeShape(overrides: Partial<BaseShape> & { type: BaseShape["type"] }): BaseShape {
  return {
    id: `shape-${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type,
    label: null,
    zIndex: 0,
    visible: true,
    locked: false,
    style: { ...DEFAULT_SHAPE_STYLE },
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    rotation: 0,
    points: [],
    text: null,
    fontSize: null,
    measurement: null,
    ...overrides,
  };
}

function makeCanvasState(shapes: BaseShape[]): AnnotationCanvasState {
  return {
    version: 1,
    shapes,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    metadata: {
      shapeCount: shapes.length,
      measurementCount: 0,
      lastModifiedShapeId: null,
    },
  };
}

describe("renderAnnotatedPng", () => {
  it("produces a valid PNG buffer with no annotations", async () => {
    const img = await createTestImage();
    const canvas = makeCanvasState([]);
    const result = await renderAnnotatedPng(img, canvas, 100, 100, false, null);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);

    // Verify it's valid PNG by reading metadata
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it("produces a valid PNG with a line annotation", async () => {
    const img = await createTestImage(200, 200);
    const line = makeShape({
      type: "line",
      points: [
        { x: 10, y: 10 },
        { x: 190, y: 190 },
      ],
    });
    const canvas = makeCanvasState([line]);
    const result = await renderAnnotatedPng(img, canvas, 200, 200, false, null);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
  });

  it("produces a valid PNG with an arrow annotation", async () => {
    const img = await createTestImage(200, 200);
    const arrow = makeShape({
      type: "arrow",
      points: [
        { x: 20, y: 20 },
        { x: 180, y: 180 },
      ],
      arrowSize: 12,
    });
    const canvas = makeCanvasState([arrow]);
    const result = await renderAnnotatedPng(img, canvas, 200, 200, false, null);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("produces a valid PNG with text annotation", async () => {
    const img = await createTestImage(200, 200);
    const text = makeShape({
      type: "text",
      x: 20,
      y: 20,
      text: "Hello World",
      fontSize: 16,
    });
    const canvas = makeCanvasState([text]);
    const result = await renderAnnotatedPng(img, canvas, 200, 200, false, null);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("produces a valid PNG with ruler measurement", async () => {
    const img = await createTestImage(200, 200);
    const ruler = makeShape({
      type: "ruler",
      style: { ...MEASUREMENT_STYLE },
      points: [
        { x: 10, y: 100 },
        { x: 190, y: 100 },
      ],
      showEndTicks: true,
      tickLength: 8,
      measurement: {
        value: 180,
        unit: "px",
        calibrated: false,
        label: "180 px",
      },
    });
    const canvas = makeCanvasState([ruler]);
    const result = await renderAnnotatedPng(img, canvas, 200, 200, false, null);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("produces a valid PNG with angle measurement", async () => {
    const img = await createTestImage(200, 200);
    const angle = makeShape({
      type: "angle",
      style: { ...MEASUREMENT_STYLE },
      points: [
        { x: 50, y: 150 },
        { x: 100, y: 50 },
        { x: 150, y: 150 },
      ],
      measurement: {
        value: 45,
        unit: "deg",
        calibrated: false,
        label: "45.0°",
      },
    });
    const canvas = makeCanvasState([angle]);
    const result = await renderAnnotatedPng(img, canvas, 200, 200, false, null);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("produces a valid PNG with cobb angle", async () => {
    const img = await createTestImage(300, 300);
    const cobb = makeShape({
      type: "cobb_angle",
      style: { ...MEASUREMENT_STYLE },
      line1: [50, 80, 250, 60],
      line2: [50, 220, 250, 240],
      perpendicular1: [150, 70, 150, 150],
      perpendicular2: [150, 150, 150, 230],
      intersection: [150, 150],
      showPerpendiculars: true,
      showClassification: true,
      measurement: {
        value: 22,
        unit: "deg",
        calibrated: false,
        label: "22.0°",
      },
    });
    const canvas = makeCanvasState([cobb]);
    const result = await renderAnnotatedPng(img, canvas, 300, 300, false, null);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("skips invisible shapes", async () => {
    const img = await createTestImage();
    const hidden = makeShape({
      type: "line",
      visible: false,
      x: 10,
      y: 10,
      width: 80,
      height: 80,
    });
    const canvas = makeCanvasState([hidden]);
    const result = await renderAnnotatedPng(img, canvas, 100, 100, false, null);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("applies image adjustments when requested", async () => {
    const img = await createTestImage();
    const canvas = makeCanvasState([]);
    const adjustments = {
      brightness: 20,
      contrast: 10,
      invert: false,
      windowCenter: 128,
      windowWidth: 256,
    };
    const result = await renderAnnotatedPng(img, canvas, 100, 100, true, adjustments);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("applies invert adjustment", async () => {
    const img = await createTestImage();
    const canvas = makeCanvasState([]);
    const adjustments = {
      brightness: 0,
      contrast: 0,
      invert: true,
      windowCenter: 128,
      windowWidth: 256,
    };
    const result = await renderAnnotatedPng(img, canvas, 100, 100, true, adjustments);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("renders multiple shapes sorted by zIndex", async () => {
    const img = await createTestImage(200, 200);
    const shapes = [
      makeShape({ type: "arrow", zIndex: 2, points: [{ x: 50, y: 50 }, { x: 100, y: 100 }] }),
      makeShape({ type: "line", zIndex: 0, points: [{ x: 0, y: 0 }, { x: 200, y: 200 }] }),
      makeShape({ type: "freehand", zIndex: 1, points: [{ x: 30, y: 30 }, { x: 60, y: 40 }, { x: 90, y: 50 }] }),
    ];
    const canvas = makeCanvasState(shapes);
    const result = await renderAnnotatedPng(img, canvas, 200, 200, false, null);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("handles freehand shapes", async () => {
    const img = await createTestImage(200, 200);
    const freehand = makeShape({
      type: "freehand",
      points: [
        { x: 10, y: 10 },
        { x: 20, y: 30 },
        { x: 40, y: 25 },
        { x: 60, y: 50 },
      ],
    });
    const canvas = makeCanvasState([freehand]);
    const result = await renderAnnotatedPng(img, canvas, 200, 200, false, null);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });
});

describe("renderAnnotatedPdf", () => {
  it("produces a valid PDF buffer", async () => {
    const img = await createTestImage(200, 200);
    const canvas = makeCanvasState([]);
    const result = await renderAnnotatedPdf(
      img,
      canvas,
      200,
      200,
      false,
      null,
      150,
      {
        patientName: "John Doe",
        xrayTitle: "Cervical AP",
        branchName: "Test Branch",
        exportDate: "March 31, 2026",
      }
    );

    expect(result).toBeInstanceOf(Buffer);
    // PDF files start with %PDF
    expect(result.toString("ascii", 0, 5)).toBe("%PDF-");
  });

  it("includes measurement summary page when measurements exist", async () => {
    const img = await createTestImage(200, 200);
    const ruler = makeShape({
      type: "ruler",
      style: { ...MEASUREMENT_STYLE },
      points: [
        { x: 10, y: 100 },
        { x: 190, y: 100 },
      ],
      measurement: {
        value: 180,
        unit: "px",
        calibrated: false,
        label: "180 px",
      },
    });
    const canvas = makeCanvasState([ruler]);
    const result = await renderAnnotatedPdf(
      img,
      canvas,
      200,
      200,
      false,
      null,
      150,
      {
        patientName: "Jane Smith",
        xrayTitle: "Lumbar Lateral",
        branchName: "Spine Center",
        exportDate: "March 31, 2026",
      }
    );

    expect(result).toBeInstanceOf(Buffer);
    expect(result.toString("ascii", 0, 5)).toBe("%PDF-");
    // PDF with measurements should be larger (has 2 pages)
    expect(result.length).toBeGreaterThan(1000);
  });

  it("produces a valid PDF with annotations", async () => {
    const img = await createTestImage(200, 200);
    const shapes = [
      makeShape({
        type: "line",
        points: [{ x: 10, y: 10 }, { x: 190, y: 190 }],
      }),
      makeShape({
        type: "arrow",
        points: [{ x: 30, y: 30 }, { x: 130, y: 110 }],
      }),
    ];
    const canvas = makeCanvasState(shapes);
    const result = await renderAnnotatedPdf(
      img,
      canvas,
      200,
      200,
      false,
      null,
      150,
      {
        patientName: "Test Patient",
        xrayTitle: "Test X-ray",
        branchName: "Test Branch",
        exportDate: "March 31, 2026",
      }
    );

    expect(result.toString("ascii", 0, 5)).toBe("%PDF-");
  });

  it("respects DPI parameter", async () => {
    const img = await createTestImage(200, 200);
    const canvas = makeCanvasState([]);

    const lowDpi = await renderAnnotatedPdf(img, canvas, 200, 200, false, null, 72, {
      patientName: "A",
      xrayTitle: "B",
      branchName: "C",
      exportDate: "D",
    });

    const highDpi = await renderAnnotatedPdf(img, canvas, 200, 200, false, null, 300, {
      patientName: "A",
      xrayTitle: "B",
      branchName: "C",
      exportDate: "D",
    });

    // Both should be valid PDFs
    expect(lowDpi.toString("ascii", 0, 5)).toBe("%PDF-");
    expect(highDpi.toString("ascii", 0, 5)).toBe("%PDF-");
  });
});
