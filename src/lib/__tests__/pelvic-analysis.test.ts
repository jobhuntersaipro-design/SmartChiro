import { describe, expect, it } from "vitest";
import {
  computePelvicAnalysis,
  formatDegrees,
  formatLength,
  landmarkPoints,
  pelvicOverlay,
  type LandmarkPoints,
  type PairParam,
  type ParamId,
  type PelvicAnalysis,
  type Pt,
  type SingleParam,
} from "../pelvic-analysis";
import { PELVIC_LANDMARKS } from "../pelvic-landmarks";

/**
 * Ground truth from the paper's own Fig. 2 (Moon et al., Heliyon 2024): the
 * centres of its 16 red dots, in pixels of the published figure. Expected
 * values were computed independently (Python) from the Table 2 definitions.
 */
const FIG2: LandmarkPoints = {
  1: { x: 388.6, y: 645.4 }, 2: { x: 1228.5, y: 632.6 },
  3: { x: 436.9, y: 58.6 }, 4: { x: 565.6, y: 1028.7 },
  5: { x: 1193.8, y: 68.0 }, 6: { x: 1054.4, y: 1013.3 },
  7: { x: 793.5, y: 270.1 }, 8: { x: 794.7, y: 875.6 },
  9: { x: 646.1, y: 152.9 }, 10: { x: 928.6, y: 159.3 },
  11: { x: 493.4, y: 281.4 }, 12: { x: 1058.6, y: 272.1 },
  13: { x: 617.7, y: 310.9 }, 14: { x: 93.7, y: 273.5 },
  15: { x: 972.7, y: 307.7 }, 16: { x: 1488.0, y: 279.6 },
};

/** ~0.23 mm per pixel: femoral heads ~190 mm apart on that figure. */
const PX_PER_MM = 1 / 0.23;

function single(a: PelvicAnalysis, id: ParamId): SingleParam {
  const p = a.params.find((x) => x.id === id);
  if (!p || p.kind !== "single") throw new Error(`no single param ${id}`);
  return p;
}

function pair(a: PelvicAnalysis, id: ParamId): PairParam {
  const p = a.params.find((x) => x.id === id);
  if (!p || p.kind !== "pair") throw new Error(`no pair param ${id}`);
  return p;
}

function rotate(points: LandmarkPoints, degrees: number): LandmarkPoints {
  const t = (degrees * Math.PI) / 180;
  const out: LandmarkPoints = {};
  for (const [id, p] of Object.entries(points)) {
    const q = p as Pt;
    out[Number(id)] = { x: q.x * Math.cos(t) - q.y * Math.sin(t), y: q.x * Math.sin(t) + q.y * Math.cos(t) };
  }
  return out;
}

describe("computePelvicAnalysis — paper Fig. 2 ground truth", () => {
  const a = computePelvicAnalysis(FIG2);

  it("returns the paper's 10 values as 7 rows", () => {
    expect(a.params.map((p) => p.id)).toEqual(["FHHD", "ALFHRF", "ICHD", "DOCS", "IM", "SAM", "ISM"]);
    expect(a.hasBaseLine).toBe(true);
    expect(a.calibrated).toBe(false);
  });

  it("measures each parameter as Table 2 defines it", () => {
    expect(single(a, "FHHD").value?.px).toBeCloseTo(12.8, 1);
    expect(single(a, "ALFHRF").degrees).toBeCloseTo(0.873, 2);
    expect(single(a, "ICHD").value?.px).toBeCloseTo(20.933, 1);
    expect(single(a, "DOCS").value?.px).toBeCloseTo(8.027, 1);
    // Standard AP: patient's right is the image left, so image-left = R.
    expect(pair(a, "IM").right?.px).toBeCloseTo(971.949, 1);
    expect(pair(a, "IM").left?.px).toBeCloseTo(943.066, 1);
    expect(pair(a, "SAM").right?.px).toBeCloseTo(300.237, 1);
    expect(pair(a, "SAM").left?.px).toBeCloseTo(265.039, 1);
    expect(pair(a, "ISM").right?.px).toBeCloseTo(523.369, 1);
    expect(pair(a, "ISM").left?.px).toBeCloseTo(515.668, 1);
    expect(pair(a, "IM").diff?.px).toBeCloseTo(28.883, 1);
  });

  it("names directions by patient side", () => {
    expect(single(a, "FHHD").direction).toBe("R lower");
    expect(single(a, "ALFHRF").direction).toBe("R lower");
    expect(single(a, "ICHD").direction).toBe("L lower");
    expect(single(a, "DOCS").direction).toBe("toward R");
    expect(pair(a, "IM").direction).toBe("R longer");
    expect(pair(a, "SAM").direction).toBe("R wider");
    expect(pair(a, "ISM").direction).toBe("R wider");
  });

  it("swaps sides when the patient's right is on the image right", () => {
    const b = computePelvicAnalysis(FIG2, { patientRightOn: "right" });
    expect(single(b, "FHHD").direction).toBe("L lower");
    expect(single(b, "DOCS").direction).toBe("toward L");
    expect(pair(b, "IM").right?.px).toBeCloseTo(943.066, 1);
    expect(pair(b, "IM").left?.px).toBeCloseTo(971.949, 1);
    expect(pair(b, "IM").direction).toBe("L longer");
  });
});

describe("computePelvicAnalysis — units and normal ranges", () => {
  it("leaves mm ranges unjudged without calibration, but judges the angle", () => {
    const a = computePelvicAnalysis(FIG2);
    expect(single(a, "FHHD").status).toBe("uncalibrated");
    expect(single(a, "FHHD").value?.mm).toBeNull();
    expect(pair(a, "IM").status).toBe("uncalibrated");
    expect(single(a, "ALFHRF").status).toBe("normal");
  });

  it("converts to mm and applies the paper's normal ranges", () => {
    const a = computePelvicAnalysis(FIG2, { pixelsPerMm: PX_PER_MM });
    expect(a.calibrated).toBe(true);
    expect(single(a, "FHHD").value?.mm).toBeCloseTo(2.94, 1);
    expect(single(a, "FHHD").status).toBe("normal"); // < 10 mm
    expect(single(a, "ICHD").status).toBe("normal"); // 4.8 mm < 5 mm
    expect(single(a, "DOCS").status).toBe("normal"); // 1.8 mm < 3 mm
    expect(pair(a, "IM").status).toBe("outside"); // |R-L| 6.6 mm ≥ 5 mm
    expect(pair(a, "SAM").status).toBe("outside"); // 8.1 mm
    expect(pair(a, "ISM").status).toBe("normal"); // 1.8 mm
  });

  it("ignores a non-positive or non-finite calibration", () => {
    for (const bad of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(computePelvicAnalysis(FIG2, { pixelsPerMm: bad }).calibrated).toBe(false);
    }
  });

  it("flags the angle once it reaches 1°", () => {
    const tilted = { ...FIG2, 2: { x: FIG2[2]!.x, y: FIG2[1]!.y - 840 * Math.tan((1.2 * Math.PI) / 180) } };
    expect(single(computePelvicAnalysis(tilted), "ALFHRF").status).toBe("outside");
  });
});

describe("computePelvicAnalysis — geometry", () => {
  it("measures in the femur base line's frame, so tilting the film changes only FHHD and ALFHRF", () => {
    const level = computePelvicAnalysis(FIG2);
    const tilted = computePelvicAnalysis(rotate(FIG2, 4));
    for (const id of ["ICHD", "DOCS"] as const) {
      expect(single(tilted, id).value?.px).toBeCloseTo(single(level, id).value!.px, 6);
    }
    for (const id of ["IM", "SAM", "ISM"] as const) {
      expect(pair(tilted, id).right?.px).toBeCloseTo(pair(level, id).right!.px, 6);
      expect(pair(tilted, id).left?.px).toBeCloseTo(pair(level, id).left!.px, 6);
    }
    expect(single(tilted, "ALFHRF").degrees).toBeCloseTo(4 - 0.873, 2);
  });

  it("reports missing landmarks by paper number", () => {
    const { 2: _gone, ...rest } = FIG2;
    void _gone;
    const a = computePelvicAnalysis(rest);
    expect(a.hasBaseLine).toBe(false);
    expect(single(a, "FHHD").status).toBe("missing");
    expect(single(a, "FHHD").missing).toEqual([2]);
    expect(pair(a, "SAM").missing).toEqual([2]);
    expect(pair(a, "SAM").right).toBeNull();
  });

  it("computes the side that exists when its partner is missing", () => {
    const { 6: _gone, ...rest } = FIG2;
    void _gone;
    const im = pair(computePelvicAnalysis(rest), "IM");
    expect(im.right?.px).toBeCloseTo(971.949, 1);
    expect(im.left).toBeNull();
    expect(im.diff).toBeNull();
    expect(im.status).toBe("missing");
    expect(im.missing).toEqual([6]);
  });

  it("gives no direction when the two sides are level", () => {
    const level = { ...FIG2, 2: { x: FIG2[2]!.x, y: FIG2[1]!.y } };
    expect(single(computePelvicAnalysis(level), "FHHD").direction).toBeNull();
  });
});

describe("pelvicOverlay", () => {
  const overlay = pelvicOverlay(FIG2);
  const analysis = computePelvicAnalysis(FIG2);
  const len = (s: { a: Pt; b: Pt }) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  const measures = (id: ParamId) => overlay.segments.filter((s) => s.role === "measure" && s.param === id);

  it("draws the femur base line and the S2 line", () => {
    expect(overlay.segments.filter((s) => s.role === "base")).toHaveLength(1);
    expect(overlay.segments.filter((s) => s.role === "plumb")).toHaveLength(1);
  });

  it("draws spans whose lengths equal the computed values", () => {
    expect(len(measures("FHHD")[0])).toBeCloseTo(single(analysis, "FHHD").value!.px, 3);
    expect(len(measures("DOCS")[0])).toBeCloseTo(single(analysis, "DOCS").value!.px, 3);
    expect(len(measures("ICHD")[0])).toBeCloseTo(single(analysis, "ICHD").value!.px, 3);
    const spans = (id: ParamId) => measures(id).map(len).sort((a, b) => a - b);
    const values = (id: ParamId) => {
      const p = pair(analysis, id);
      return [p.right!.px, p.left!.px].sort((a, b) => a - b);
    };
    for (const id of ["IM", "SAM", "ISM"] as const) {
      expect(spans(id)[0]).toBeCloseTo(values(id)[0], 3);
      expect(spans(id)[1]).toBeCloseTo(values(id)[1], 3);
    }
  });

  it("tags every measured value once per side", () => {
    expect(overlay.tags.map((t) => `${t.param}${t.imageSide ?? ""}`).sort()).toEqual(
      ["DOCS", "FHHD", "ICHD", "IMleft", "IMright", "ISMleft", "ISMright", "SAMleft", "SAMright"],
    );
  });

  it("draws nothing without the femur base line", () => {
    expect(pelvicOverlay({ 7: FIG2[7], 8: FIG2[8] })).toEqual({ segments: [], tags: [] });
  });
});

describe("landmarkPoints", () => {
  it("maps stored landmark keys to paper numbers and ignores unknown names", () => {
    const pts = landmarkPoints([
      { name: "femoral_head_top_img_left", x: 1, y: 2 },
      { name: "s2_tubercle", x: 3, y: 4 },
      { name: "top_of_femoral_head_1", x: 9, y: 9 },
      { x: 5, y: 5 },
    ]);
    expect(pts).toEqual({ 1: { x: 1, y: 2 }, 7: { x: 3, y: 4 } });
  });

  it("keeps the last of duplicate keys", () => {
    const pts = landmarkPoints([
      { name: "symphysis_pubis", x: 1, y: 1 },
      { name: "symphysis_pubis", x: 2, y: 2 },
    ]);
    expect(pts[8]).toEqual({ x: 2, y: 2 });
  });

  it("covers all 16 catalog keys", () => {
    const pts = landmarkPoints(PELVIC_LANDMARKS.map((d) => ({ name: d.key, x: d.id, y: d.id })));
    expect(Object.keys(pts).map(Number).sort((a, b) => a - b)).toEqual(PELVIC_LANDMARKS.map((d) => d.id));
  });
});

describe("formatting", () => {
  it("shows mm with one decimal when available, whole px otherwise", () => {
    expect(formatLength({ px: 12.8, mm: 2.944 })).toBe("2.9 mm");
    expect(formatLength({ px: 12.8, mm: 2.944 }, "px")).toBe("13 px");
    expect(formatLength({ px: 12.8, mm: null }, "mm")).toBe("13 px");
    expect(formatDegrees(0.873)).toBe("0.9°");
  });
});
