import { describe, it, expect } from "vitest";
import {
  computeBiasMap,
  applyBiasCorrection,
  type CorrectionRow,
} from "../landmark-bias-correction";

// Convenience builder — only the fields the helpers consume.
function row(over: Partial<CorrectionRow> & { landmarkName: string }): CorrectionRow {
  return {
    aiX: 100,
    aiY: 200,
    finalX: 110,
    finalY: 210,
    imageWidth: 1000,
    imageHeight: 1000,
    ...over,
  };
}

describe("computeBiasMap", () => {
  it("returns nothing when there are no corrections", () => {
    expect(computeBiasMap([]).size).toBe(0);
  });

  it("excludes landmarks below the minimum sample threshold", () => {
    const map = computeBiasMap(
      [
        row({ landmarkName: "top_of_femoral_head_1" }),
        row({ landmarkName: "top_of_femoral_head_1" }),
      ],
      3,
    );
    expect(map.size).toBe(0);
  });

  it("normalizes deltas by image dimensions so cross-resolution samples compose", () => {
    // Three corrections at different image sizes — same anatomical delta
    // (+1% of width, +2% of height) → bias should be (+0.01, +0.02).
    const corrections: CorrectionRow[] = [
      { landmarkName: "fh", aiX: 100, aiY: 100, finalX: 110, finalY: 120, imageWidth: 1000, imageHeight: 1000 },
      { landmarkName: "fh", aiX: 200, aiY: 200, finalX: 220, finalY: 240, imageWidth: 2000, imageHeight: 2000 },
      { landmarkName: "fh", aiX: 50, aiY: 50, finalX: 55, finalY: 60, imageWidth: 500, imageHeight: 500 },
    ];
    const map = computeBiasMap(corrections, 3);
    const entry = map.get("fh");
    expect(entry).toBeDefined();
    expect(entry!.dxFrac).toBeCloseTo(0.01, 6);
    expect(entry!.dyFrac).toBeCloseTo(0.02, 6);
    expect(entry!.n).toBe(3);
  });

  it("uses median (not mean) so a single outlier doesn't move the bias", () => {
    // 4 sensible corrections at +1% / +1%, plus one outlier at +50%.
    // Mean would jump to ~11%; median should stay at ~1%.
    const sensible: CorrectionRow[] = Array.from({ length: 4 }, () => ({
      landmarkName: "fh", aiX: 0, aiY: 0, finalX: 10, finalY: 10, imageWidth: 1000, imageHeight: 1000,
    }));
    const outlier: CorrectionRow = {
      landmarkName: "fh", aiX: 0, aiY: 0, finalX: 500, finalY: 500, imageWidth: 1000, imageHeight: 1000,
    };
    const map = computeBiasMap([...sensible, outlier], 3);
    const entry = map.get("fh")!;
    expect(entry.dxFrac).toBeCloseTo(0.01, 6);
    expect(entry.dyFrac).toBeCloseTo(0.01, 6);
  });

  it("ignores corrections with non-finite or zero dimensions", () => {
    const corrections: CorrectionRow[] = [
      { landmarkName: "fh", aiX: 0, aiY: 0, finalX: 10, finalY: 10, imageWidth: 0, imageHeight: 1000 },
      { landmarkName: "fh", aiX: 0, aiY: 0, finalX: 10, finalY: 10, imageWidth: 1000, imageHeight: Number.NaN },
      { landmarkName: "fh", aiX: 0, aiY: 0, finalX: 10, finalY: 10, imageWidth: 1000, imageHeight: 1000 },
      { landmarkName: "fh", aiX: 0, aiY: 0, finalX: 10, finalY: 10, imageWidth: 1000, imageHeight: 1000 },
      { landmarkName: "fh", aiX: 0, aiY: 0, finalX: 10, finalY: 10, imageWidth: 1000, imageHeight: 1000 },
    ];
    const map = computeBiasMap(corrections, 3);
    expect(map.get("fh")!.n).toBe(3);
  });

  it("buckets independently per landmark name", () => {
    const corrections: CorrectionRow[] = [
      ...Array.from({ length: 3 }, () => row({ landmarkName: "a", finalX: 110 })),
      ...Array.from({ length: 3 }, () => row({ landmarkName: "b", finalX: 90 })),
    ];
    const map = computeBiasMap(corrections, 3);
    expect(map.get("a")!.dxFrac).toBeCloseTo(0.01, 6);
    expect(map.get("b")!.dxFrac).toBeCloseTo(-0.01, 6);
  });
});

describe("applyBiasCorrection", () => {
  it("passes through landmarks when no corrections meet the threshold", () => {
    const landmarks = [{ name: "fh", displayName: "FH", x: 100, y: 100 }];
    const out = applyBiasCorrection(landmarks, [], 1024, 768);
    expect(out).toEqual(landmarks);
  });

  it("adds the median normalized delta scaled to current image dimensions", () => {
    // Build 3 corrections at +5% x / -3% y → bias should be (+0.05, -0.03).
    // Apply against a 2000×2000 image → expect +100 / -60 px shift.
    const corrections: CorrectionRow[] = Array.from({ length: 3 }, () => ({
      landmarkName: "fh", aiX: 0, aiY: 0, finalX: 50, finalY: -30, imageWidth: 1000, imageHeight: 1000,
    }));
    const landmarks = [{ name: "fh", displayName: "FH", x: 500, y: 500 }];
    const out = applyBiasCorrection(landmarks, corrections, 2000, 2000);
    expect(out[0].x).toBeCloseTo(600, 6); // 500 + 0.05*2000
    expect(out[0].y).toBeCloseTo(440, 6); // 500 + (-0.03)*2000
  });

  it("leaves landmarks without enough samples unchanged", () => {
    const corrections: CorrectionRow[] = [
      ...Array.from({ length: 3 }, () => ({
        landmarkName: "fh", aiX: 0, aiY: 0, finalX: 50, finalY: 50, imageWidth: 1000, imageHeight: 1000,
      })),
      // Only 2 samples for "ic" — below threshold of 3.
      { landmarkName: "ic", aiX: 0, aiY: 0, finalX: 50, finalY: 50, imageWidth: 1000, imageHeight: 1000 },
      { landmarkName: "ic", aiX: 0, aiY: 0, finalX: 50, finalY: 50, imageWidth: 1000, imageHeight: 1000 },
    ];
    const landmarks = [
      { name: "fh", displayName: "FH", x: 100, y: 100 },
      { name: "ic", displayName: "IC", x: 200, y: 200 },
    ];
    const out = applyBiasCorrection(landmarks, corrections, 1000, 1000);
    expect(out[0].x).not.toBe(100); // corrected
    expect(out[1].x).toBe(200);     // untouched
    expect(out[1].y).toBe(200);
  });

  it("clamps corrected coordinates to image bounds", () => {
    // Strong correction that would push the landmark past the image edge.
    const corrections: CorrectionRow[] = Array.from({ length: 3 }, () => ({
      landmarkName: "fh", aiX: 0, aiY: 0, finalX: 1000, finalY: 1000, imageWidth: 1000, imageHeight: 1000,
    }));
    const landmarks = [{ name: "fh", displayName: "FH", x: 950, y: 950 }];
    const out = applyBiasCorrection(landmarks, corrections, 1000, 1000);
    expect(out[0].x).toBe(1000); // 950 + 1.0*1000 = 1950, clamped to 1000
    expect(out[0].y).toBe(1000);
  });

  it("respects a custom minSamples threshold", () => {
    const corrections: CorrectionRow[] = Array.from({ length: 5 }, () => ({
      landmarkName: "fh", aiX: 0, aiY: 0, finalX: 50, finalY: 50, imageWidth: 1000, imageHeight: 1000,
    }));
    const landmarks = [{ name: "fh", displayName: "FH", x: 100, y: 100 }];
    // Threshold above the sample count → no correction applied.
    const out = applyBiasCorrection(landmarks, corrections, 1000, 1000, 10);
    expect(out[0].x).toBe(100);
    expect(out[0].y).toBe(100);
  });
});
