/**
 * Radiographic parameters for pelvic displacement, as defined in Moon et al.,
 * Heliyon 2024 (PMC11040132), Table 2, computed from the 16 landmarks in
 * `pelvic-landmarks.ts`.
 *
 * Reference frame (paper + its Fig. 5):
 *   - Femur base line (FBL): the line through the tops of the femoral heads
 *     (landmarks 1 and 2). `u` is its unit direction (1 → 2), `n` its unit
 *     normal, pointing down the image.
 *   - Lines "parallel to the femur base line" are measured apart along `n`;
 *     lines "perpendicular to the femur base line" are measured apart along `u`.
 *   - FHHD and ALFHRF use the image axes (the standing film's true vertical).
 *
 *   FHHD     |y1 - y2|                              normal < 10 mm
 *   ALFHRF   angle of line 1-2 vs image horizontal  normal < 1°
 *   IM       |(P3 - P4)·n| and |(P5 - P6)·n|        normal |R - L| < 5 mm
 *   ICHD     |(P3 - P5)·n|                          normal < 5 mm
 *   DOCS     |(P8 - P7)·u|                          normal < 3 mm
 *   SAM      |(P11 - P7)·u| and |(P12 - P7)·u|      normal |R - L| < 5 mm
 *   ISM      |(P14 - P13)·u| and |(P16 - P15)·u|    normal |R - L| < 5 mm
 *
 * Coordinates are pixels of the film as displayed (upright), +y down: the
 * viewer orients the stored points first (`orientPoint`), since "lower" and
 * the image axes only mean something on the upright film. Millimetres come
 * from the film's calibration (pixels per mm); without it, distances stay in
 * pixels and the mm thresholds can't be judged.
 */

import type { Rotation } from "@/lib/orientation";
import {
  PELVIC_LANDMARKS,
  landmarkByKey,
  patientSideOf,
  type PatientSide,
} from "@/lib/pelvic-landmarks";

export interface Pt {
  x: number;
  y: number;
}

/** Landmark positions keyed by paper number (1-16). */
export type LandmarkPoints = Partial<Record<number, Pt>>;

export interface Length {
  px: number;
  mm: number | null;
}

export type ParamId = "FHHD" | "ALFHRF" | "ICHD" | "DOCS" | "IM" | "SAM" | "ISM";

/**
 * normal / outside: compared with the paper's normal range.
 * uncalibrated: computed in px, but the range is in mm.
 * missing: a required landmark is absent.
 */
export type ParamStatus = "normal" | "outside" | "uncalibrated" | "missing";

interface ParamBase {
  id: ParamId;
  label: string;
  description: string;
  /** The paper's normal range, e.g. "< 10 mm". */
  normal: string;
  status: ParamStatus;
  /** Plain-language direction, e.g. "R lower" or "toward L"; null when level or missing. */
  direction: string | null;
  /** Paper numbers of required landmarks that are absent. */
  missing: number[];
}

export interface SingleParam extends ParamBase {
  kind: "single";
  /** Distance parameters. */
  value: Length | null;
  /** ALFHRF only. */
  degrees: number | null;
}

export interface PairParam extends ParamBase {
  kind: "pair";
  /** Values by PATIENT side. */
  right: Length | null;
  left: Length | null;
  /** |right - left|, the quantity the normal range applies to. */
  diff: Length | null;
}

export type PelvicParam = SingleParam | PairParam;

export interface PelvicAnalysisOptions {
  /** From the film's calibration line; null/undefined when uncalibrated. */
  pixelsPerMm?: number | null;
  /** Image side holding the patient's right; standard AP films put it on the left. */
  patientRightOn?: "left" | "right";
}

export interface PelvicAnalysis {
  params: PelvicParam[];
  /** Whether the femur base line (landmarks 1 and 2) exists; every distance but FHHD needs it. */
  hasBaseLine: boolean;
  calibrated: boolean;
}

const LIMIT_MM = { FHHD: 10, ICHD: 5, DOCS: 3, IM: 5, SAM: 5, ISM: 5 } as const;
const LIMIT_DEG = 1;

function validScale(pixelsPerMm: number | null | undefined): number | null {
  return pixelsPerMm != null && Number.isFinite(pixelsPerMm) && pixelsPerMm > 0 ? pixelsPerMm : null;
}

function length(px: number, scale: number | null): Length {
  return { px, mm: scale ? px / scale : null };
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;

interface Frame {
  u: Pt;
  n: Pt;
}

/**
 * Unit direction of the femur base line (1 → 2) and its normal; null if
 * degenerate. The normal always points down the image, so "lower" holds
 * whichever way 1 → 2 runs (it runs right to left on a mirrored view).
 */
function baseFrame(p: LandmarkPoints): Frame | null {
  const a = p[1];
  const b = p[2];
  if (!a || !b) return null;
  const d = sub(b, a);
  const len = Math.hypot(d.x, d.y);
  if (len === 0) return null;
  const u = { x: d.x / len, y: d.y / len };
  const n = { x: -u.y, y: u.x };
  return { u, n: n.y < 0 ? { x: -n.x, y: -n.y } : n };
}

function missingIds(p: LandmarkPoints, ids: readonly number[]): number[] {
  return ids.filter((id) => !p[id]);
}

function judge(value: number | null, limit: number, scale: number | null): ParamStatus {
  if (value == null) return "missing";
  if (!scale) return "uncalibrated";
  return value / scale < limit ? "normal" : "outside";
}

function sideWord(imageSide: "left" | "right", patientRightOn: "left" | "right"): PatientSide {
  return patientSideOf(imageSide, patientRightOn) as PatientSide;
}

/**
 * The side whose landmark sits lower on the film (larger y), as a patient side.
 * Returns null when level to within half a pixel.
 */
function lowerSide(leftY: number, rightY: number, patientRightOn: "left" | "right"): PatientSide | null {
  if (Math.abs(leftY - rightY) < 0.5) return null;
  return sideWord(leftY > rightY ? "left" : "right", patientRightOn);
}

function single(
  base: Omit<ParamBase, "status" | "missing" | "direction">,
  missing: number[],
  value: Length | null,
  degrees: number | null,
  status: ParamStatus,
  direction: string | null,
): SingleParam {
  return { ...base, kind: "single", missing, value, degrees, status, direction };
}

function pair(
  base: Omit<ParamBase, "status" | "missing" | "direction">,
  ids: { imgLeft: [number, number]; imgRight: [number, number] },
  measure: (a: Pt, b: Pt) => number,
  p: LandmarkPoints,
  needsFrame: boolean,
  frame: Frame | null,
  scale: number | null,
  patientRightOn: "left" | "right",
  word: string,
): PairParam {
  const required = [...new Set([...ids.imgLeft, ...ids.imgRight, ...(needsFrame ? [1, 2] : [])])];
  const missing = missingIds(p, required);
  const side = (pts: [number, number]): number | null => {
    const [a, b] = [p[pts[0]], p[pts[1]]];
    if (!a || !b || (needsFrame && !frame)) return null;
    return measure(a, b);
  };
  const imgLeft = side(ids.imgLeft);
  const imgRight = side(ids.imgRight);
  const rightPx = patientRightOn === "left" ? imgLeft : imgRight;
  const leftPx = patientRightOn === "left" ? imgRight : imgLeft;
  const diffPx = rightPx != null && leftPx != null ? Math.abs(rightPx - leftPx) : null;
  let direction: string | null = null;
  if (rightPx != null && leftPx != null && diffPx! >= 0.5) {
    direction = `${rightPx > leftPx ? "R" : "L"} ${word}`;
  }
  return {
    ...base,
    kind: "pair",
    missing,
    right: rightPx == null ? null : length(rightPx, scale),
    left: leftPx == null ? null : length(leftPx, scale),
    diff: diffPx == null ? null : length(diffPx, scale),
    status: judge(diffPx, base.id === "IM" ? LIMIT_MM.IM : base.id === "SAM" ? LIMIT_MM.SAM : LIMIT_MM.ISM, scale),
    direction,
  };
}

export function computePelvicAnalysis(
  points: LandmarkPoints,
  options: PelvicAnalysisOptions = {},
): PelvicAnalysis {
  const scale = validScale(options.pixelsPerMm);
  const rightOn = options.patientRightOn ?? "left";
  const frame = baseFrame(points);
  const along = (a: Pt, b: Pt) => Math.abs(dot(sub(a, b), frame!.u));
  const across = (a: Pt, b: Pt) => Math.abs(dot(sub(a, b), frame!.n));
  const p = points;

  // FHHD — image vertical between the femoral head tops.
  const fhhdMissing = missingIds(p, [1, 2]);
  const fhhdPx = p[1] && p[2] ? Math.abs(p[1].y - p[2].y) : null;
  const headLower = p[1] && p[2] ? lowerSide(p[1].y, p[2].y, rightOn) : null;
  const fhhd = single(
    { id: "FHHD", label: "FHHD", description: "Femoral head height difference", normal: "< 10 mm" },
    fhhdMissing,
    fhhdPx == null ? null : length(fhhdPx, scale),
    null,
    judge(fhhdPx, LIMIT_MM.FHHD, scale),
    headLower ? `${headLower} lower` : null,
  );

  // ALFHRF — tilt of the femoral head line against the image horizontal.
  let degrees: number | null = null;
  if (p[1] && p[2] && frame) {
    const d = sub(p[2], p[1]);
    degrees = (Math.atan2(Math.abs(d.y), Math.abs(d.x)) * 180) / Math.PI;
  }
  const alfhrf = single(
    { id: "ALFHRF", label: "ALFHRF", description: "Femoral head line angle to horizontal", normal: "< 1°" },
    fhhdMissing,
    null,
    degrees,
    degrees == null ? "missing" : degrees < LIMIT_DEG ? "normal" : "outside",
    headLower ? `${headLower} lower` : null,
  );

  // ICHD — iliac crests measured along the femur base line's normal.
  const ichdMissing = missingIds(p, [3, 5, 1, 2]);
  const ichdPx = p[3] && p[5] && frame ? across(p[3], p[5]) : null;
  let crestLower: PatientSide | null = null;
  if (p[3] && p[5] && frame && ichdPx! >= 0.5) {
    // Height above the base line is -(P·n); the crest with less height is lower.
    const h3 = -dot(p[3], frame.n);
    const h5 = -dot(p[5], frame.n);
    crestLower = sideWord(h3 < h5 ? "left" : "right", rightOn);
  }
  const ichd = single(
    { id: "ICHD", label: "ICHD", description: "Iliac crest height difference", normal: "< 5 mm" },
    ichdMissing,
    ichdPx == null ? null : length(ichdPx, scale),
    null,
    judge(ichdPx, LIMIT_MM.ICHD, scale),
    crestLower ? `${crestLower} lower` : null,
  );

  // DOCS — symphysis off the S2 line drawn at right angles to the base line.
  const docsMissing = missingIds(p, [7, 8, 1, 2]);
  let docsPx: number | null = null;
  let docsDir: string | null = null;
  if (p[7] && p[8] && frame) {
    const s = dot(sub(p[8], p[7]), frame.u);
    docsPx = Math.abs(s);
    if (docsPx >= 0.5) docsDir = `toward ${sideWord(s > 0 ? "right" : "left", rightOn)}`;
  }
  const docs = single(
    { id: "DOCS", label: "DOCS", description: "Symphysis offset from the S2 line", normal: "< 3 mm" },
    docsMissing,
    docsPx == null ? null : length(docsPx, scale),
    null,
    judge(docsPx, LIMIT_MM.DOCS, scale),
    docsDir,
  );

  const im = pair(
    { id: "IM", label: "IM", description: "Innominate: iliac crest to ischial tuberosity", normal: "R-L < 5 mm" },
    { imgLeft: [3, 4], imgRight: [5, 6] }, across, p, true, frame, scale, rightOn, "longer",
  );
  const sam = pair(
    { id: "SAM", label: "SAM", description: "Sacral ala: S2 to lateral sacrum", normal: "R-L < 5 mm" },
    { imgLeft: [11, 7], imgRight: [12, 7] }, along, p, true, frame, scale, rightOn, "wider",
  );
  const ism = pair(
    { id: "ISM", label: "ISM", description: "Ilium shadow: lateral ilium to medial sacrum", normal: "R-L < 5 mm" },
    { imgLeft: [14, 13], imgRight: [16, 15] }, along, p, true, frame, scale, rightOn, "wider",
  );

  return {
    params: [fhhd, alfhrf, ichd, docs, im, sam, ism],
    hasBaseLine: frame != null,
    calibrated: scale != null,
  };
}

/**
 * Screen side holding the patient's right, from display-frame points: where
 * the placed patient-right landmarks sit against the patient-left ones. Null
 * unless both sides have a landmark.
 */
export function patientRightOnScreen(
  points: LandmarkPoints,
  patientRightOn: "left" | "right",
): "left" | "right" | null {
  const sum = { R: 0, L: 0 };
  const count = { R: 0, L: 0 };
  for (const def of PELVIC_LANDMARKS) {
    const q = points[def.id];
    const side = patientSideOf(def.imageSide, patientRightOn);
    if (!q || !side) continue;
    sum[side] += q.x;
    count[side] += 1;
  }
  if (!count.R || !count.L) return null;
  return sum.R / count.R < sum.L / count.L ? "left" : "right";
}

/**
 * The view sent with an AI request, `{ rotation, flipV }`: the film as on
 * screen minus any horizontal mirror (the server turns the film by these and
 * names image sides in that frame). flipH acts before the rotation, so at
 * 90°/270° it mirrors the screen vertically; the same picture without the
 * horizontal mirror is then the film turned a further 180°.
 */
export function analysisView(view: {
  rotation?: Rotation;
  flipH?: boolean;
  flipV?: boolean;
}): { rotation: Rotation; flipV: boolean } {
  const rotation = view.rotation ?? 0;
  const quarter = rotation === 90 || rotation === 270;
  return {
    rotation: view.flipH && quarter ? (((rotation + 180) % 360) as Rotation) : rotation,
    flipV: !!view.flipV,
  };
}

/** One decimal mm when calibrated (or asked for), whole pixels otherwise. */
export function formatLength(value: Length, unit: "mm" | "px" = value.mm != null ? "mm" : "px"): string {
  if (unit === "mm" && value.mm != null) return `${value.mm.toFixed(1)} mm`;
  return `${Math.round(value.px)} px`;
}

export function formatDegrees(degrees: number): string {
  return `${degrees.toFixed(1)}°`;
}

/**
 * Positions keyed by paper number from stored landmarks (shape.landmarkName
 * → point). Names that aren't one of the 16 keys are ignored; the last
 * duplicate wins.
 */
export function landmarkPoints(items: readonly { name?: string; x: number; y: number }[]): LandmarkPoints {
  const out: LandmarkPoints = {};
  for (const item of items) {
    const def = item.name ? landmarkByKey(item.name) : undefined;
    if (def) out[def.id] = { x: item.x, y: item.y };
  }
  return out;
}

// ─── Construction overlay (the paper's Fig. 5) ───

export interface OverlaySegment {
  a: Pt;
  b: Pt;
  /** base: femur base line; plumb: S2 line; guide: projection/level lines; measure: the measured span. */
  role: "base" | "plumb" | "guide" | "measure";
  param?: ParamId;
}

export interface OverlayTag {
  param: ParamId;
  /** For pair params: which IMAGE side's value this tag shows. */
  imageSide?: "left" | "right";
  at: Pt;
}

export interface PelvicOverlay {
  segments: OverlaySegment[];
  tags: OverlayTag[];
}

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const scaleBy = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Lines to draw over the film: the femur base line, the S2 line at right
 * angles to it, and one measured span per parameter (as in the paper's
 * Fig. 5). Only parts whose landmarks exist are returned.
 */
export function pelvicOverlay(points: LandmarkPoints): PelvicOverlay {
  const p = points;
  const frame = baseFrame(p);
  const segments: OverlaySegment[] = [];
  const tags: OverlayTag[] = [];
  if (!frame || !p[1] || !p[2]) return { segments, tags };
  const { u, n } = frame;
  // Screen-left along the base line (n points down), whichever way 1 → 2 runs.
  const left = { x: -n.y, y: n.x };
  const span = Math.hypot(p[2].x - p[1].x, p[2].y - p[1].y);
  const ext = span * 0.15;

  segments.push({ a: add(p[1], scaleBy(u, -ext)), b: add(p[2], scaleBy(u, ext)), role: "base" });

  // FHHD: level line from the higher head, vertical gap down to the lower one.
  {
    const [hi, lo] = p[1].y <= p[2].y ? [p[1], p[2]] : [p[2], p[1]];
    const levelEnd = { x: lo.x, y: hi.y };
    segments.push({ a: hi, b: levelEnd, role: "guide", param: "FHHD" });
    segments.push({ a: levelEnd, b: lo, role: "measure", param: "FHHD" });
    // Landmark names are drawn to the right of each point, so value tags sit to the left.
    tags.push({ param: "FHHD", at: add(mid(levelEnd, lo), scaleBy(left, span * 0.1)) });
  }

  const onLine = (origin: Pt, q: Pt, dir: Pt) => add(origin, scaleBy(dir, dot(sub(q, origin), dir)));

  // S2 line (plumb) and DOCS.
  if (p[7]) {
    const bottom = p[8] ? dot(sub(p[8], p[7]), n) + span * 0.08 : span * 0.6;
    segments.push({ a: add(p[7], scaleBy(n, -span * 0.12)), b: add(p[7], scaleBy(n, bottom)), role: "plumb" });
    if (p[8]) {
      const foot = onLine(p[7], p[8], n);
      segments.push({ a: foot, b: p[8], role: "measure", param: "DOCS" });
      tags.push({ param: "DOCS", at: add(mid(foot, p[8]), scaleBy(n, span * 0.06)) });
    }
  }

  // ICHD: lines parallel to the base line through each crest, gap at the lower one.
  if (p[3] && p[5]) {
    const foot5 = onLine(p[3], p[5], u); // p5's level projected onto the line through p3
    segments.push({ a: p[3], b: foot5, role: "guide", param: "ICHD" });
    segments.push({ a: foot5, b: p[5], role: "measure", param: "ICHD" });
    tags.push({ param: "ICHD", at: add(mid(foot5, p[5]), scaleBy(left, span * 0.1)) });
  }

  // IM per side: from the crest down to the ischial tuberosity's level.
  for (const [crest, ischium, side] of [[3, 4, "left"], [5, 6, "right"]] as const) {
    const c = p[crest];
    const s = p[ischium];
    if (!c || !s) continue;
    const foot = onLine(c, s, n);
    segments.push({ a: c, b: foot, role: "measure", param: "IM" });
    segments.push({ a: foot, b: s, role: "guide", param: "IM" });
    tags.push({ param: "IM", imageSide: side, at: mid(c, foot) });
  }

  // SAM and ISM along the S2 level, parallel to the base line.
  if (p[7]) {
    const s2 = p[7];
    const proj = (q: Pt) => onLine(s2, q, u);
    const lateral = [p[14], p[16], p[11], p[12]].filter(Boolean) as Pt[];
    if (lateral.length) {
      const ts = lateral.map((q) => dot(sub(q, s2), u));
      segments.push({
        a: add(s2, scaleBy(u, Math.min(0, ...ts))),
        b: add(s2, scaleBy(u, Math.max(0, ...ts))),
        role: "guide",
      });
    }
    for (const [id, side] of [[11, "left"], [12, "right"]] as const) {
      const q = p[id];
      if (!q) continue;
      const f = proj(q);
      segments.push({ a: q, b: f, role: "guide", param: "SAM" });
      segments.push({ a: f, b: s2, role: "measure", param: "SAM" });
      tags.push({ param: "SAM", imageSide: side, at: add(mid(f, s2), scaleBy(n, -span * 0.025)) });
    }
    // ISM drawn just below the S2 line so it doesn't hide SAM.
    const drop = scaleBy(n, span * 0.04);
    for (const [lat, med, side] of [[14, 13, "left"], [16, 15, "right"]] as const) {
      const a = p[lat];
      const b = p[med];
      if (!a || !b) continue;
      const fa = add(proj(a), drop);
      const fb = add(proj(b), drop);
      segments.push({ a, b: fa, role: "guide", param: "ISM" });
      segments.push({ a: b, b: fb, role: "guide", param: "ISM" });
      segments.push({ a: fa, b: fb, role: "measure", param: "ISM" });
      tags.push({ param: "ISM", imageSide: side, at: add(mid(fa, fb), scaleBy(n, span * 0.03)) });
    }
  }

  return { segments, tags };
}
