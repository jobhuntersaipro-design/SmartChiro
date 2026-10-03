import { describe, it, expect } from "vitest";
import { computePelvicAnalysis, type LandmarkPoints } from "../pelvic-analysis";
import { pelvicSummary, pelvicSummaryText } from "../pelvic-summary";

// A level, symmetric pelvis (image px; 1 px = 1 mm when calibrated).
const LEVEL: LandmarkPoints = {
  1: { x: 300, y: 600 }, 2: { x: 700, y: 600 },
  3: { x: 250, y: 200 }, 5: { x: 750, y: 200 },
  4: { x: 320, y: 900 }, 6: { x: 680, y: 900 },
  7: { x: 500, y: 350 }, 8: { x: 500, y: 800 },
  9: { x: 450, y: 300 }, 10: { x: 550, y: 300 },
  11: { x: 400, y: 350 }, 12: { x: 600, y: 350 },
  13: { x: 440, y: 350 }, 15: { x: 560, y: 350 },
  14: { x: 200, y: 350 }, 16: { x: 800, y: 350 },
};

describe("pelvicSummary", () => {
  it("says everything is in range for a level, calibrated pelvis", () => {
    const summary = pelvicSummary(computePelvicAnalysis(LEVEL, { pixelsPerMm: 1 }), "mm");
    expect(summary.headline).toBe("All 7 measured parameters within the normal range.");
    expect(summary.findings.every((f) => !f.outside)).toBe(true);
    expect(summary.findings.find((f) => f.id === "FHHD")?.text).toBe("Femoral heads: level (normal < 10 mm).");
    expect(summary.suggestions).toEqual([]);
  });

  it("puts out-of-range findings first and suggests a leg length check for uneven femoral heads", () => {
    // Patient's right on the image left (standard AP): drop its femoral head 15 mm.
    const low = { ...LEVEL, 1: { x: 300, y: 615 } };
    const summary = pelvicSummary(computePelvicAnalysis(low, { pixelsPerMm: 1 }), "mm");
    expect(summary.findings[0]).toMatchObject({ id: "FHHD", outside: true, text: "Femoral heads: R lower by 15.0 mm (normal < 10 mm)." });
    expect(summary.findings.findIndex((f) => !f.outside)).toBeGreaterThan(summary.findings.findLastIndex((f) => f.outside));
    expect(summary.headline).toMatch(/^\d of 7 measured parameters outside the normal range\.$/);
    expect(summary.suggestions[0]).toBe(
      "Uneven femoral heads (R lower): check for a leg length inequality, e.g. supine and prone leg checks.",
    );
  });

  it("reads uneven crests on a level femoral head line as innominate rotation", () => {
    const crest = { ...LEVEL, 5: { x: 750, y: 212 } };
    const summary = pelvicSummary(computePelvicAnalysis(crest, { pixelsPerMm: 1 }), "mm");
    expect(summary.findings[0]).toMatchObject({ id: "ICHD", outside: true, text: "Iliac crests: L lower by 12.0 mm (normal < 5 mm)." });
    expect(summary.suggestions.some((s) => s.includes("innominate rotation rather than leg length"))).toBe(true);
  });

  it("gives the Gonstead reading for innominate and ilium differences", () => {
    const rotated = { ...LEVEL, 4: { x: 320, y: 912 }, 14: { x: 180, y: 350 } };
    const summary = pelvicSummary(computePelvicAnalysis(rotated, { pixelsPerMm: 1 }), "mm");
    expect(summary.suggestions.some((s) => s.includes("longer side (R) suggests a PI ilium"))).toBe(true);
    expect(summary.suggestions.some((s) => s.includes("wider ilium (R) suggests IN"))).toBe(true);
  });

  it("asks for calibration and missing landmarks when it can't judge", () => {
    const partial = { ...LEVEL };
    delete partial[4];
    const summary = pelvicSummary(computePelvicAnalysis(partial), "px");
    expect(summary.headline).toBe("Measured in pixels: calibrate to judge the distances against the normal ranges.");
    expect(summary.suggestions.some((s) => s.startsWith("Calibrate the film"))).toBe(true);
    expect(summary.suggestions.some((s) => s.includes("missing landmarks"))).toBe(true);
    expect(summary.findings.find((f) => f.id === "IM")).toBeUndefined();
  });

  it("asks for the femoral heads when nothing can be measured", () => {
    expect(pelvicSummary(computePelvicAnalysis({}), "px").headline).toBe(
      "Place landmarks 1 and 2 (femoral heads) to start measuring.",
    );
  });

  it("formats a copyable note", () => {
    const text = pelvicSummaryText(pelvicSummary(computePelvicAnalysis(LEVEL, { pixelsPerMm: 1 }), "mm"));
    expect(text.split("\n")[0]).toBe("Pelvic X-ray analysis (Moon et al. 2024): All 7 measured parameters within the normal range.");
    expect(text).toContain("- Femoral heads: level");
  });
});
