import { describe, expect, it } from "vitest";
import {
  computeALFHRF,
  computeDOCS,
  computeFHHD,
  computeICHD,
  computePelvicAnalysis,
  formatParamValue,
  type LandmarkPoint,
} from "../pelvic-analysis";

// Convenience builder: pass a partial map of landmark names → points and
// get back an array suitable for the compute* helpers. Missing keys are
// simply omitted from the array, mirroring what the canvas would feed in
// when a user has deleted some landmarks.
function landmarks(record: Partial<Record<string, [number, number]>>): LandmarkPoint[] {
  return Object.entries(record)
    .filter((entry): entry is [string, [number, number]] => entry[1] !== undefined)
    .map(([name, [x, y]]) => ({ name, x, y }));
}

describe("computeFHHD", () => {
  it("returns the absolute vertical difference between femoral heads", () => {
    const r = computeFHHD(
      landmarks({
        top_of_left_femoral_head: [100, 200],
        top_of_right_femoral_head: [400, 230],
      }),
    );
    expect(r.value).toEqual({ kind: "distance", pixels: 30, mm: null });
    expect(r.missing).toEqual([]);
  });

  it("is sign-independent (returns same value regardless of which side is lower)", () => {
    const a = computeFHHD(
      landmarks({
        top_of_left_femoral_head: [100, 200],
        top_of_right_femoral_head: [400, 230],
      }),
    );
    const b = computeFHHD(
      landmarks({
        top_of_left_femoral_head: [100, 230],
        top_of_right_femoral_head: [400, 200],
      }),
    );
    expect(a.value).toEqual(b.value);
  });

  it("converts to mm when calibrated", () => {
    const r = computeFHHD(
      landmarks({
        top_of_left_femoral_head: [100, 200],
        top_of_right_femoral_head: [400, 230],
      }),
      3, // 3 px/mm → 30 px = 10 mm
    );
    expect(r.value).toEqual({ kind: "distance", pixels: 30, mm: 10 });
  });

  it("returns null value + lists missing landmarks when input is incomplete", () => {
    const r = computeFHHD(landmarks({ top_of_left_femoral_head: [100, 200] }));
    expect(r.value).toBeNull();
    expect(r.missing).toEqual(["top_of_right_femoral_head"]);
  });

  it("ignores invalid calibration (zero, negative, NaN)", () => {
    const points = landmarks({
      top_of_left_femoral_head: [100, 200],
      top_of_right_femoral_head: [400, 230],
    });
    for (const ppm of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = computeFHHD(points, ppm);
      expect(r.value).toEqual({ kind: "distance", pixels: 30, mm: null });
    }
  });
});

describe("computeICHD", () => {
  it("uses iliac crest y-coordinates", () => {
    const r = computeICHD(
      landmarks({
        top_of_left_iliac_crest: [120, 80],
        top_of_right_iliac_crest: [380, 92],
      }),
    );
    expect(r.value).toEqual({ kind: "distance", pixels: 12, mm: null });
  });

  it("reports missing landmarks", () => {
    const r = computeICHD(landmarks({ top_of_right_iliac_crest: [380, 92] }));
    expect(r.value).toBeNull();
    expect(r.missing).toEqual(["top_of_left_iliac_crest"]);
  });
});

describe("computeALFHRF", () => {
  it("returns 0° for a perfectly level femoral line", () => {
    const r = computeALFHRF(
      landmarks({
        top_of_left_femoral_head: [100, 200],
        top_of_right_femoral_head: [400, 200],
      }),
    );
    expect(r.value).toEqual({ kind: "angle", degrees: 0 });
  });

  it("returns a positive angle when the right side tilts down", () => {
    // Right head 100 px lower over a 100 px horizontal run → 45°.
    const r = computeALFHRF(
      landmarks({
        top_of_left_femoral_head: [100, 200],
        top_of_right_femoral_head: [200, 300],
      }),
    );
    expect(r.value).toEqual({ kind: "angle", degrees: 45 });
  });

  it("returns a negative angle when the left side tilts down", () => {
    const r = computeALFHRF(
      landmarks({
        top_of_left_femoral_head: [100, 300],
        top_of_right_femoral_head: [200, 200],
      }),
    );
    expect(r.value).toEqual({ kind: "angle", degrees: -45 });
  });

  it("orients by x-position so a flipped image still yields the correct sign", () => {
    // Pass the names swapped relative to their on-screen x position to
    // simulate an image that's been flipped horizontally. Sign must follow
    // physical layout (right side of image), not the canonical landmark name.
    const r = computeALFHRF([
      { name: "top_of_left_femoral_head", x: 400, y: 200 },
      { name: "top_of_right_femoral_head", x: 100, y: 300 },
    ]);
    // After x-orientation: leftmost point is right-named at (100,300),
    // rightmost is left-named at (400,200). dy = 200 - 300 = -100, dx = 300
    // → atan2(-100, 300) ≈ -18.4°.
    if (r.value?.kind !== "angle") throw new Error("expected angle");
    expect(r.value.degrees).toBeCloseTo(-18.43, 2);
  });

  it("returns 0° (not NaN) when both landmarks share the same coordinates", () => {
    const r = computeALFHRF(
      landmarks({
        top_of_left_femoral_head: [150, 200],
        top_of_right_femoral_head: [150, 200],
      }),
    );
    expect(r.value).toEqual({ kind: "angle", degrees: 0 });
  });

  it("reports both missing names when input is empty", () => {
    const r = computeALFHRF([]);
    expect(r.value).toBeNull();
    expect(r.missing).toEqual([
      "top_of_left_femoral_head",
      "top_of_right_femoral_head",
    ]);
  });
});

describe("computeDOCS", () => {
  it("returns the horizontal offset between symphysis pubis and S2 tubercle", () => {
    const r = computeDOCS(
      landmarks({
        center_of_symphysis_pubis: [248, 600],
        second_sacral_tubercle: [250, 300],
      }),
    );
    expect(r.value).toEqual({ kind: "distance", pixels: 2, mm: null });
  });

  it("converts to mm when calibrated", () => {
    const r = computeDOCS(
      landmarks({
        center_of_symphysis_pubis: [240, 600],
        second_sacral_tubercle: [250, 300],
      }),
      2, // 2 px/mm → 10 px = 5 mm
    );
    expect(r.value).toEqual({ kind: "distance", pixels: 10, mm: 5 });
  });

  it("returns 0 px when perfectly aligned", () => {
    const r = computeDOCS(
      landmarks({
        center_of_symphysis_pubis: [250, 600],
        second_sacral_tubercle: [250, 300],
      }),
    );
    expect(r.value).toEqual({ kind: "distance", pixels: 0, mm: null });
  });
});

describe("computePelvicAnalysis", () => {
  it("computes all four parameters in one pass", () => {
    const all = computePelvicAnalysis(
      landmarks({
        top_of_left_femoral_head: [100, 200],
        top_of_right_femoral_head: [400, 230],
        top_of_left_iliac_crest: [110, 80],
        top_of_right_iliac_crest: [390, 95],
        center_of_symphysis_pubis: [248, 600],
        second_sacral_tubercle: [250, 300],
      }),
      3,
    );
    expect(all.fhhd.value).toEqual({ kind: "distance", pixels: 30, mm: 10 });
    expect(all.ichd.value).toEqual({ kind: "distance", pixels: 15, mm: 5 });
    expect(all.alfhrf.value?.kind).toBe("angle");
    expect(all.docs.value).toEqual({ kind: "distance", pixels: 2, mm: 2 / 3 });
  });

  it("gracefully degrades when partial landmarks are placed", () => {
    const all = computePelvicAnalysis(
      landmarks({
        top_of_left_femoral_head: [100, 200],
        top_of_right_femoral_head: [400, 230],
      }),
    );
    expect(all.fhhd.value).not.toBeNull();
    expect(all.alfhrf.value).not.toBeNull();
    expect(all.ichd.value).toBeNull();
    expect(all.docs.value).toBeNull();
    expect(all.ichd.missing).toContain("top_of_left_iliac_crest");
    expect(all.docs.missing).toContain("center_of_symphysis_pubis");
  });
});

describe("formatParamValue", () => {
  it("renders mm when calibration is available", () => {
    const r = computeFHHD(
      landmarks({
        top_of_left_femoral_head: [100, 200],
        top_of_right_femoral_head: [400, 230],
      }),
      3,
    );
    expect(formatParamValue(r)).toBe("10.0 mm");
  });

  it("renders px when calibration is missing", () => {
    const r = computeFHHD(
      landmarks({
        top_of_left_femoral_head: [100, 200],
        top_of_right_femoral_head: [400, 230],
      }),
    );
    expect(formatParamValue(r)).toBe("30.0 px");
  });

  it("renders degrees for angle params", () => {
    const r = computeALFHRF(
      landmarks({
        top_of_left_femoral_head: [100, 200],
        top_of_right_femoral_head: [200, 300],
      }),
    );
    expect(formatParamValue(r)).toBe("45.0°");
  });

  it("returns null when the param could not be computed", () => {
    const r = computeFHHD([]);
    expect(formatParamValue(r)).toBeNull();
  });
});
