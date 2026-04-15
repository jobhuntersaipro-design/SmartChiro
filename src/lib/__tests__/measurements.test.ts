import { describe, it, expect } from "vitest";
import {
  computeRulerMeasurement,
  computeAngleMeasurement,
  computeCobbAngle,
  formatMeasurement,
  recalibrateMeasurement,
} from "@/lib/measurements";

// ─── computeRulerMeasurement ───

describe("computeRulerMeasurement", () => {
  it("computes pixel distance", () => {
    const result = computeRulerMeasurement(
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    );
    expect(result.pixelLength).toBe(100);
    expect(result.unit).toBe("px");
    expect(result.label).toBe("100 px");
  });

  it("computes diagonal distance correctly", () => {
    const result = computeRulerMeasurement(
      { x: 0, y: 0 },
      { x: 3, y: 4 }
    );
    expect(result.pixelLength).toBe(5);
    expect(result.label).toBe("5 px");
  });

  it("handles zero-length line", () => {
    const result = computeRulerMeasurement(
      { x: 50, y: 50 },
      { x: 50, y: 50 }
    );
    expect(result.pixelLength).toBe(0);
    expect(result.label).toBe("0 px");
  });

  it("rounds pixel values", () => {
    const result = computeRulerMeasurement(
      { x: 0, y: 0 },
      { x: 142, y: 0 }
    );
    expect(result.pixelLength).toBe(142);
    expect(result.label).toBe("142 px");
  });
});

// ─── computeAngleMeasurement ───

describe("computeAngleMeasurement", () => {
  it("computes 90° angle", () => {
    const result = computeAngleMeasurement(
      { x: 100, y: 0 },   // A — right
      { x: 0, y: 0 },     // V — vertex at origin
      { x: 0, y: 100 }    // C — down
    );
    expect(result.degrees).toBeCloseTo(90, 1);
    expect(result.supplementary).toBeCloseTo(90, 1);
    expect(result.label).toBe("90.0°");
  });

  it("computes 45° angle", () => {
    const result = computeAngleMeasurement(
      { x: 100, y: 0 },   // A — right
      { x: 0, y: 0 },     // V — vertex at origin
      { x: 100, y: 100 }  // C — diagonal
    );
    expect(result.degrees).toBeCloseTo(45, 1);
    expect(result.supplementary).toBeCloseTo(135, 1);
  });

  it("computes 180° (straight line)", () => {
    const result = computeAngleMeasurement(
      { x: -100, y: 0 },  // A — left
      { x: 0, y: 0 },     // V — vertex
      { x: 100, y: 0 }    // C — right
    );
    expect(result.degrees).toBeCloseTo(180, 1);
    expect(result.supplementary).toBeCloseTo(0, 1);
  });

  it("computes 0° (same direction)", () => {
    const result = computeAngleMeasurement(
      { x: 50, y: 0 },    // A — right
      { x: 0, y: 0 },     // V — vertex
      { x: 100, y: 0 }    // C — also right
    );
    expect(result.degrees).toBeCloseTo(0, 1);
    expect(result.supplementary).toBeCloseTo(180, 1);
  });

  it("works with vertex not at origin", () => {
    const result = computeAngleMeasurement(
      { x: 200, y: 100 },   // A
      { x: 100, y: 100 },   // V — vertex
      { x: 100, y: 200 }    // C
    );
    expect(result.degrees).toBeCloseTo(90, 1);
  });

  it("label has one decimal place", () => {
    const result = computeAngleMeasurement(
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 50 }
    );
    expect(result.label).toMatch(/^\d+\.\d°$/);
  });
});

// ─── computeCobbAngle ───

describe("computeCobbAngle", () => {
  it("computes 0° for parallel horizontal lines", () => {
    const result = computeCobbAngle(
      { x: 0, y: 0 }, { x: 100, y: 0 },     // line 1 — horizontal
      { x: 0, y: 200 }, { x: 100, y: 200 }   // line 2 — also horizontal
    );
    expect(result.degrees).toBeCloseTo(0, 1);
    expect(result.classification).toBe("Mild");
  });

  it("computes 90° for perpendicular lines", () => {
    const result = computeCobbAngle(
      { x: 0, y: 0 }, { x: 100, y: 0 },     // line 1 — horizontal
      { x: 50, y: 100 }, { x: 50, y: 200 }   // line 2 — vertical
    );
    expect(result.degrees).toBeCloseTo(90, 1);
    expect(result.classification).toBe("Severe");
  });

  it("classifies mild (<10°)", () => {
    const tilt = Math.tan(5 * Math.PI / 180) * 100;
    const result = computeCobbAngle(
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 0, y: 200 }, { x: 100, y: 200 + tilt }
    );
    expect(result.degrees).toBeCloseTo(5, 0);
    expect(result.classification).toBe("Mild");
  });

  it("classifies moderate (10-25°)", () => {
    const tilt = Math.tan(18 * Math.PI / 180) * 100;
    const result = computeCobbAngle(
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 0, y: 200 }, { x: 100, y: 200 + tilt }
    );
    expect(result.degrees).toBeCloseTo(18, 0);
    expect(result.classification).toBe("Moderate");
  });

  it("classifies severe (>25°)", () => {
    const tilt = Math.tan(35 * Math.PI / 180) * 100;
    const result = computeCobbAngle(
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 0, y: 200 }, { x: 100, y: 200 + tilt }
    );
    expect(result.degrees).toBeCloseTo(35, 0);
    expect(result.classification).toBe("Severe");
  });

  it("returns perpendicular lines from midpoints to intersection", () => {
    const result = computeCobbAngle(
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 0, y: 200 }, { x: 100, y: 200 }
    );
    expect(result.perp1[0]).toBe(50);
    expect(result.perp1[1]).toBe(0);
    expect(result.perp2[0]).toBe(50);
    expect(result.perp2[1]).toBe(200);
  });

  it("boundary: just above 10° is Moderate", () => {
    const tilt = Math.tan(10.5 * Math.PI / 180) * 100;
    const result = computeCobbAngle(
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 0, y: 200 }, { x: 100, y: 200 + tilt }
    );
    expect(result.classification).toBe("Moderate");
  });

  it("boundary: exactly 25° is Moderate", () => {
    const tilt = Math.tan(25 * Math.PI / 180) * 100;
    const result = computeCobbAngle(
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 0, y: 200 }, { x: 100, y: 200 + tilt }
    );
    expect(result.classification).toBe("Moderate");
  });
});

// ─── formatMeasurement ───

describe("formatMeasurement", () => {
  it("returns px when uncalibrated", () => {
    expect(formatMeasurement(100, "px", null)).toBe("100 px");
  });

  it("returns mm when calibrated (small value)", () => {
    // 20 px/mm → 100px = 5mm
    expect(formatMeasurement(100, "px", 20)).toBe("5.0 mm");
  });

  it("returns cm for values >= 10mm", () => {
    // 2 px/mm → 100px = 50mm = 5.0 cm
    expect(formatMeasurement(100, "px", 2)).toBe("5.0 cm");
  });

  it("leaves degrees unchanged regardless of calibration", () => {
    expect(formatMeasurement(45.2, "deg", null)).toBe("45.2°");
    expect(formatMeasurement(45.2, "deg", 4)).toBe("45.2°");
  });

  it("returns px when pixelsPerMm is 0", () => {
    expect(formatMeasurement(100, "px", 0)).toBe("100 px");
  });

  it("returns px when pixelsPerMm is negative", () => {
    expect(formatMeasurement(100, "px", -1)).toBe("100 px");
  });

  it("handles very small pixelsPerMm", () => {
    // 0.05 px/mm → 100px = 2000mm = 200.0 cm
    expect(formatMeasurement(100, "px", 0.05)).toBe("200.0 cm");
  });

  it("handles very large pixelsPerMm", () => {
    // 500 px/mm → 100px = 0.2mm
    expect(formatMeasurement(100, "px", 500)).toBe("0.2 mm");
  });
});

// ─── recalibrateMeasurement ───

describe("recalibrateMeasurement", () => {
  it("recalibrates a pixel measurement to mm", () => {
    const m = { value: 100, unit: "px" as const, calibrated: false, label: "100 px" };
    const result = recalibrateMeasurement(m, 20);
    expect(result.calibrated).toBe(true);
    expect(result.label).toBe("5.0 mm");
    expect(result.value).toBe(100); // raw value unchanged
  });

  it("reverts to px when pixelsPerMm is null", () => {
    const m = { value: 100, unit: "px" as const, calibrated: true, label: "25.0 mm" };
    const result = recalibrateMeasurement(m, null);
    expect(result.calibrated).toBe(false);
    expect(result.label).toBe("100 px");
  });

  it("does not calibrate degree measurements", () => {
    const m = { value: 45, unit: "deg" as const, calibrated: false, label: "45.0°" };
    const result = recalibrateMeasurement(m, 4);
    expect(result.calibrated).toBe(false);
    expect(result.label).toBe("45.0°");
  });
});
