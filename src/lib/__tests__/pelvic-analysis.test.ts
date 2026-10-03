import { describe, expect, it } from "vitest";
import {
  analysisView,
  computePelvicAnalysis,
  formatDegrees,
  formatLength,
  landmarkPoints,
  patientRightOnScreen,
  pelvicOverlay,
  type LandmarkPoints,
  type PairParam,
  type ParamId,
  type PelvicAnalysis,
  type Pt,
  type SingleParam,
} from "../pelvic-analysis";
import { PELVIC_LANDMARKS, landmarkById, patientSideOf } from "../pelvic-landmarks";
import { orientPoint, unorientPoint, type Orientation, type Rotation } from "../orientation";
import { resolveShapeRefs } from "../measurements";
import { DEFAULT_SHAPE_STYLE, type BaseShape } from "@/types/annotation";
import {
  landmarkSideSourceOf,
  mergeDetectedLandmarks,
  patientRightOnOf,
  patientSideNote,
  pelvicPointsOf,
  plainLandmarkCopy,
} from "@/components/annotation/PelvisOverlay";

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

  it("keeps 'lower' on the right crest when line 1 → 2 runs right to left (mirrored view)", () => {
    const mirrored: LandmarkPoints = {};
    for (const [id, q] of Object.entries(FIG2)) mirrored[Number(id)] = { x: 2000 - q!.x, y: q!.y };
    const a = computePelvicAnalysis(mirrored);
    expect(single(a, "ICHD").value?.px).toBeCloseTo(20.933, 1);
    expect(single(a, "ICHD").direction).toBe("L lower");
    expect(single(a, "FHHD").direction).toBe("R lower");
    expect(single(a, "DOCS").direction).toBe("toward R");
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

  it("lists a shared landmark once when it is missing", () => {
    const { 7: _gone, ...rest } = FIG2;
    void _gone;
    const a = computePelvicAnalysis(rest);
    expect(pair(a, "SAM").missing).toEqual([7]);
    expect(single(a, "DOCS").missing).toEqual([7]);
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

// ─── The viewer's path: stored points → displayed film → analysis ───

/** Landmark shapes as the AI stores them (standard AP: patient's right on image left). */
function landmarkShape(id: string, name: string | undefined, p: Pt, extra: Partial<BaseShape> = {}): BaseShape {
  return {
    id,
    type: "landmark",
    label: null,
    zIndex: 1,
    visible: true,
    locked: false,
    style: { ...DEFAULT_SHAPE_STYLE },
    x: p.x,
    y: p.y,
    width: 0,
    height: 0,
    rotation: 0,
    points: [p],
    text: null,
    fontSize: null,
    measurement: null,
    landmarkName: name,
    ...extra,
  };
}

function shapesOf(points: LandmarkPoints, extra: Partial<BaseShape> = {}): BaseShape[] {
  return Object.entries(points).map(([id, p]) => {
    const def = landmarkById(Number(id))!;
    return landmarkShape(`lm-${id}`, def.key, p!, {
      landmarkSide: patientSideOf(def.imageSide, "left") ?? undefined,
      ...extra,
    });
  });
}

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const W = 1600;
const H = 1100;

describe("analysisView", () => {
  it("sends the screen's rotation and vertical flip", () => {
    expect(analysisView({})).toEqual({ rotation: 0, flipV: false });
    expect(analysisView({ rotation: 90, flipV: true })).toEqual({ rotation: 90, flipV: true });
    expect(analysisView({ rotation: 180, flipH: true })).toEqual({ rotation: 180, flipV: false });
  });

  it("turns a further 180° at 90°/270° when the view is mirrored", () => {
    expect(analysisView({ rotation: 90, flipH: true })).toEqual({ rotation: 270, flipV: false });
    expect(analysisView({ rotation: 270, flipH: true, flipV: true })).toEqual({ rotation: 90, flipV: true });
  });

  it("gives the frame the screen shows, mirrored only by flipH", () => {
    const p = { x: 300, y: 200 };
    for (const rotation of ROTATIONS) {
      for (const flipH of [false, true]) {
        for (const flipV of [false, true]) {
          const screen: Orientation = { rotation, flipH, flipV, width: W, height: H };
          const sent = analysisView(screen);
          const server: Orientation = { ...sent, flipH: false, width: W, height: H };
          const onScreen = orientPoint(p, screen);
          const analysed = orientPoint(p, server);
          expect(onScreen.x).toBeCloseTo(flipH ? W - analysed.x : analysed.x, 9);
          expect(onScreen.y).toBeCloseTo(analysed.y, 9);
        }
      }
    }
  });
});

describe("pelvic analysis on a rotated / flipped view", () => {
  const upright = computePelvicAnalysis(FIG2);

  // The film is stored in any orientation; the user turns it upright on
  // screen (rotation × flipH × flipV). The server places the landmarks on
  // the upright film it was sent (analysisView), returned in stored pixels.
  for (const rotation of ROTATIONS) {
    for (const flipH of [false, true]) {
      for (const flipV of [false, true]) {
        it(`matches the upright result at ${rotation}°${flipH ? " + flip H" : ""}${flipV ? " + flip V" : ""}`, () => {
          const screen: Orientation = { rotation, flipH, flipV, width: W, height: H };
          const server: Orientation = { ...analysisView(screen), flipH: false, width: W, height: H };
          const stored: LandmarkPoints = {};
          for (const [id, q] of Object.entries(FIG2)) stored[Number(id)] = unorientPoint(q!, server);
          const shapes = shapesOf(stored);

          const points = pelvicPointsOf(shapes, screen);
          const a = computePelvicAnalysis(points, { patientRightOn: patientRightOnOf(shapes) });

          for (const id of ["FHHD", "ICHD", "DOCS"] as const) {
            expect(single(a, id).value?.px).toBeCloseTo(single(upright, id).value!.px, 6);
          }
          expect(single(a, "ALFHRF").degrees).toBeCloseTo(single(upright, "ALFHRF").degrees!, 6);
          for (const id of ["IM", "SAM", "ISM"] as const) {
            expect(pair(a, id).right?.px).toBeCloseTo(pair(upright, id).right!.px, 6);
            expect(pair(a, id).left?.px).toBeCloseTo(pair(upright, id).left!.px, 6);
          }
          expect(a.params.map((p) => p.direction)).toEqual(upright.params.map((p) => p.direction));
          expect(patientSideNote(shapes, screen)).toBe(
            `R/L are patient sides: patient's right on the ${flipH ? "right" : "left"} of the screen.`,
          );
        });
      }
    }
  }

  it("would misread a sideways film measured in stored pixels", () => {
    const screen: Orientation = { rotation: 90, flipH: false, flipV: false, width: W, height: H };
    const stored: LandmarkPoints = {};
    for (const [id, q] of Object.entries(FIG2)) stored[Number(id)] = unorientPoint(q!, screen);
    expect(single(computePelvicAnalysis(stored), "ALFHRF").degrees).toBeGreaterThan(80);
  });
});

describe("patientRightOnScreen", () => {
  it("compares where the patient-right landmarks sit against the patient-left ones", () => {
    expect(patientRightOnScreen(FIG2, "left")).toBe("left");
    expect(patientRightOnScreen(FIG2, "right")).toBe("right");
  });

  it("is unknown without a landmark on each side", () => {
    expect(patientRightOnScreen({ 1: FIG2[1], 7: FIG2[7] }, "left")).toBeNull();
  });
});

describe("patientSideNote", () => {
  it("says whether R/L came from the film's marker", () => {
    expect(landmarkSideSourceOf(shapesOf(FIG2))).toBeNull();
    expect(patientSideNote(shapesOf(FIG2, { landmarkSideSource: "marker" }))).toBe(
      "R/L are patient sides: patient's right on the left of the screen, from the R/L marker.",
    );
    expect(patientSideNote(shapesOf({ 7: FIG2[7] }, { landmarkSideSource: "assumed" }))).toBe(
      "R/L are patient sides: assumed (no side marker found).",
    );
  });
});

describe("mergeDetectedLandmarks", () => {
  const femLeft = landmarkShape("keep-1", "femoral_head_top_img_left", { x: 1, y: 1 }, {
    landmarkSource: "manual",
    landmarkSide: "R",
    zIndex: 4,
  });
  const femLeftDup = landmarkShape("dup-1", "femoral_head_top_img_left", { x: 2, y: 2 });
  const crest = landmarkShape("crest", "iliac_crest_top_img_left", { x: 3, y: 3 });
  const legacy = landmarkShape("legacy", "top_of_femoral_head_1", { x: 4, y: 4 });
  const ruler: BaseShape = {
    ...landmarkShape("ruler", undefined, { x: 1, y: 1 }),
    type: "ruler",
    points: [{ x: 1, y: 1 }, { x: 50, y: 1 }],
    pointRefs: [{ shapeId: "keep-1", vertexIndex: 0 }, null],
  };
  const current = [femLeft, femLeftDup, crest, legacy, ruler];
  const merge = mergeDetectedLandmarks(
    current,
    {
      landmarks: [
        { id: 1, key: "femoral_head_top_img_left", x: 100, y: 200, confidence: 0.9 },
        { id: 7, key: "s2_tubercle", x: 300, y: 150, confidence: 0.4 },
      ],
      patientRightOn: "right",
      sideSource: "marker",
    },
    42,
  );

  it("moves a landmark already on the film, keeping its id", () => {
    expect(merge.modified).toHaveLength(1);
    const { before, after } = merge.modified[0];
    expect(before).toBe(femLeft);
    expect(after).toMatchObject({
      id: "keep-1",
      zIndex: 4,
      points: [{ x: 100, y: 200 }],
      landmarkSource: "ai",
      landmarkOriginalX: 100,
      landmarkOriginalY: 200,
      landmarkSide: "L",
      landmarkSideSource: "marker",
      landmarkConfidence: 0.9,
      label: "1 L Femoral head",
    });
  });

  it("adds new keys and removes duplicates, keys not returned and older names", () => {
    expect(merge.added.map((s) => [s.id, s.landmarkName, s.landmarkSide, s.landmarkSideSource])).toEqual([
      ["landmark-42-1", "s2_tubercle", undefined, "marker"],
    ]);
    expect(merge.removed.map((s) => s.id)).toEqual(["dup-1", "crest", "legacy"]);
  });

  it("keeps measurements snapped to a moved landmark following it", () => {
    const after = current
      .filter((s) => !merge.removed.includes(s))
      .map((s) => merge.modified.find((m) => m.before.id === s.id)?.after ?? s);
    const byId = new Map(after.map((s) => [s.id, s]));
    expect(resolveShapeRefs(ruler, byId).points[0]).toEqual({ x: 100, y: 200 });
  });
});

describe("plainLandmarkCopy", () => {
  it("drops the catalog key and AI metadata, so only the original is measured", () => {
    const original = landmarkShape("a", "symphysis_pubis", { x: 10, y: 10 }, {
      landmarkSource: "ai",
      landmarkSide: undefined,
      landmarkSideSource: "assumed",
      landmarkOriginalX: 10,
      landmarkOriginalY: 10,
      landmarkConfidence: 0.8,
    });
    const copy = plainLandmarkCopy({ ...original, id: "b", points: [{ x: 30, y: 30 }] });
    expect(copy).toMatchObject({ landmarkName: undefined, landmarkSideSource: undefined, landmarkSource: "manual" });
    expect(copy.landmarkOriginalX).toBeUndefined();
    expect(copy.landmarkConfidence).toBeUndefined();
    expect(pelvicPointsOf([original, copy])[8]).toEqual({ x: 10, y: 10 });
  });

  it("leaves other shapes alone", () => {
    const line = { ...landmarkShape("l", undefined, { x: 0, y: 0 }), type: "line" as const };
    expect(plainLandmarkCopy(line)).toBe(line);
  });
});
