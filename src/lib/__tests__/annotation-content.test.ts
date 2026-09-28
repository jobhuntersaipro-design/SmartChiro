import { describe, it, expect } from "vitest";
import { countShapes, hasCustomAdjustments, isEmptyAnnotation } from "@/lib/annotation-content";

describe("countShapes", () => {
  it("counts canvasState.shapes", () => {
    expect(countShapes({ version: 1, shapes: [{ id: "a" }, { id: "b" }] })).toBe(2);
    expect(countShapes({ version: 1, shapes: [] })).toBe(0);
  });

  it("is 0 for missing or malformed state", () => {
    expect(countShapes(null)).toBe(0);
    expect(countShapes({})).toBe(0);
    expect(countShapes({ shapes: "nope" })).toBe(0);
    expect(countShapes([{ id: "a" }])).toBe(0);
  });
});

describe("hasCustomAdjustments", () => {
  it("is false for defaults, including explicit default orientation", () => {
    expect(hasCustomAdjustments(undefined)).toBe(false);
    expect(hasCustomAdjustments({ brightness: 0, contrast: 0, invert: false })).toBe(false);
    expect(
      hasCustomAdjustments({ brightness: 0, contrast: 0, invert: false, flipH: false, flipV: false, rotation: 0 }),
    ).toBe(false);
  });

  it("is true for any changed adjustment, orientation or calibration", () => {
    expect(hasCustomAdjustments({ brightness: 10, contrast: 0, invert: false })).toBe(true);
    expect(hasCustomAdjustments({ brightness: 0, contrast: -5, invert: false })).toBe(true);
    expect(hasCustomAdjustments({ brightness: 0, contrast: 0, invert: true })).toBe(true);
    expect(hasCustomAdjustments({ brightness: 0, contrast: 0, invert: false, flipH: true })).toBe(true);
    expect(hasCustomAdjustments({ brightness: 0, contrast: 0, invert: false, rotation: 270 })).toBe(true);
    expect(hasCustomAdjustments({ brightness: 0, contrast: 0, invert: false, pixelsPerMm: 3.2 })).toBe(true);
  });
});

describe("isEmptyAnnotation", () => {
  it("needs both no shapes and default adjustments", () => {
    expect(isEmptyAnnotation({ shapes: [] }, { brightness: 0, contrast: 0, invert: false })).toBe(true);
    expect(isEmptyAnnotation({ shapes: [] }, null)).toBe(true);
    expect(isEmptyAnnotation({ shapes: [{ id: "a" }] }, null)).toBe(false);
    expect(isEmptyAnnotation({ shapes: [] }, { brightness: 0, contrast: 0, invert: false, flipV: true })).toBe(false);
  });
});
