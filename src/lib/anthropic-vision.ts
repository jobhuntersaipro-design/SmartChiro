import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { unorientPoint } from "@/lib/orientation";
import {
  PELVIC_LANDMARKS,
  PELVIC_LANDMARK_ORDER_RULE,
  landmarkById,
  type PelvicLandmarkDef,
} from "@/lib/pelvic-landmarks";
import type { Point } from "@/types/annotation";
import type {
  DetectLandmarksResponse,
  DetectedLandmark,
  PelvisAnalysisView,
  PelvisImageAssessment,
} from "@/types/pelvis";

/**
 * AI pelvic landmark detection on AP pelvis / AP full-spine radiographs,
 * after Moon et al., Heliyon 2024 (PMC11040132): 16 landmarks, from which
 * `pelvic-analysis.ts` computes the paper's 10 parameters.
 *
 * The film is first turned upright the way the viewer shows it (its rotation
 * and vertical flip, never its horizontal flip), then three passes, each a
 * Claude vision call with structured JSON output:
 *   1. Assess (effort low): the whole film, downscaled. Is it an upright AP
 *      pelvis we can analyse, where is the bony pelvis, is there a side
 *      marker? `decideSuitability` turns the answer into accept / reject in
 *      code.
 *   2. Locate (effort high): crop to the pelvis box + 6%, ask for all 16
 *      points 3 times in parallel and take the per-axis median. Runs that
 *      disagree lower the confidence, and so does breaking the
 *      left-to-right order along S2.
 *   3. Refine (effort medium): bone-edge points 1-6 and 8 only, each in a
 *      2x zoomed window with a magenta cross on the estimate. Small moves are
 *      kept, jumps ignored, and confidence never rises above pass 2's.
 *      (Refining 14/16 and the sacral group made them worse in evaluation.)
 *      Skipped when less than 20 s of the deadline is left.
 *
 * Time: every call carries the caller's abort signal and a timeout that ends
 * it 2 s before the deadline. Running out of time (or being aborted) before
 * pass 2 finishes is a `timeout` VisionApiError; pass 3 keeps pass 2's points.
 *
 * Measured with this pipeline on a labelled test film: mean radial error
 * ~3.4 mm, 69-75% of landmarks within 4 mm, FHHD / ALFHRF / ICHD within
 * 0.3 mm / 0.1°. The paper's trained CNN: 2.9 mm, 80%.
 *
 * Privacy boundary: the entry point takes image bytes only, so no xrayId,
 * patient, branch, doctor or filename can reach Anthropic through it. The
 * route at `/api/viewer/detect-landmarks` does auth and the R2 fetch.
 *
 * Coordinates: the model answers in the pixel grid of the image it was SENT
 * (each prompt states that grid's exact size); a `Frame` maps them back to
 * the upright film's pixels, and `storedMapping` from there to the STORED
 * image's pixels (view undone, scaled to the X-ray's recorded size).
 */

export const VISION_MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_TOKENS = 16000;
/** Longest any one model call may take; each also ends DEADLINE_MARGIN before the deadline. */
const CALL_TIMEOUT = 45_000;
const DEADLINE_MARGIN = 2_000;
/** Time that must be left before pass 3 starts. */
const REFINE_MIN_REMAINING = 20_000;
/** Stored vs decoded aspect-ratio mismatch worth a warning. */
const ASPECT_TOLERANCE = 0.02;
const TIMEOUT_MESSAGE = "The AI analysis took too long. Please try again.";
const API_ERROR_MESSAGE = "The AI service returned an error. Please try again.";
const RATE_LIMITED_MESSAGE = "The AI service is busy; try again in a minute.";

/** Long edge of every image we send. */
const MAX_SENT_EDGE = 1568;
/** Anything bigger is not a radiograph we can decode sensibly. */
const MAX_DECODED_EDGE = 16384;
const MIN_PELVIS_BOX = 32;
/** Pass-2 crop margin around the pelvis box, per side, as a fraction of its size. */
const CROP_MARGIN = 0.06;
const LOCATE_RUNS = 3;
/** Disagreement between runs that takes the confidence to zero, as a fraction of the crop's long edge. */
const SPREAD_LIMIT = 0.03;
const MIN_CONFIDENCE = 0.05;
/** Bone-edge landmarks that a zoomed second look improves. */
const REFINE_IDS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6, 8]);
/** Refine window side, hint radius and accepted move, as fractions of the pass-2 crop's long edge. */
const REFINE_WINDOW = 0.3;
const REFINE_HINT = 0.06;
const REFINE_MAX_MOVE = 0.08;
/** Left-to-right order along the S2 level (image sides). */
const S2_ORDER = [14, 11, 13, 7, 15, 12, 16];
const ISCHIAL_IDS = [4, 6];

/** Legacy result shape; only the unused `landmark-bias-correction.ts` still imports it. */
export interface Landmark {
  name: string;
  displayName: string;
  x: number;
  y: number;
}

export class VisionApiError extends Error {
  constructor(
    public readonly code: "image_too_large" | "invalid_image" | "vision_api_error" | "rate_limited" | "timeout",
    message: string,
  ) {
    super(message);
    this.name = "VisionApiError";
  }
}

interface Size {
  width: number;
  height: number;
}

/** 8-bit grayscale pixels: the decoded image (EXIF orientation applied), or that turned upright. */
interface Film extends Size {
  pixels: Buffer;
}

/** One analysis's model client, abort signal and deadline (epoch ms; Infinity when none). */
interface Call {
  client: Anthropic;
  signal?: AbortSignal;
  deadline: number;
}

/** A rectangle of the film, in original pixels. */
export interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A region and the size it was sent at: original = left + sent × width / sentWidth. */
export interface Frame extends Region {
  sentWidth: number;
  sentHeight: number;
}

export interface PointEstimate {
  x: number;
  y: number;
  confidence: number;
}

/** Landmark id → point. */
export type LandmarkPoints = Map<number, PointEstimate>;

export type PelvisAnalysis =
  | { kind: "rejected"; assessment: PelvisImageAssessment; reasons: string[] }
  | ({ kind: "accepted" } & DetectLandmarksResponse);

type Effort = "low" | "medium" | "high";
type Box = [number, number, number, number];

// ─── Pure helpers ───

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === v) ?? fallback;
}

export function toOriginal(frame: Frame, x: number, y: number): { x: number; y: number } {
  return {
    x: frame.left + (x * frame.width) / frame.sentWidth,
    y: frame.top + (y * frame.height) / frame.sentHeight,
  };
}

export function toSent(frame: Frame, x: number, y: number): { x: number; y: number } {
  return {
    x: ((x - frame.left) * frame.sentWidth) / frame.width,
    y: ((y - frame.top) * frame.sentHeight) / frame.height,
  };
}

/** Send `region` with its long edge at `longEdge` px. */
export function fitFrame(region: Region, longEdge: number): Frame {
  const scale = longEdge / Math.max(region.width, region.height);
  return {
    ...region,
    sentWidth: Math.max(1, Math.round(region.width * scale)),
    sentHeight: Math.max(1, Math.round(region.height * scale)),
  };
}

/** Fit within MAX_SENT_EDGE, enlarging small regions up to 2x. */
function standardFrame(region: Region): Frame {
  return fitFrame(region, Math.min(MAX_SENT_EDGE, 2 * Math.max(region.width, region.height)));
}

/** The pelvis box plus CROP_MARGIN of its size on every side, clamped to the film. */
export function expandBox(
  [x0, y0, x1, y1]: Box,
  film: { width: number; height: number },
): Region {
  const dx = (x1 - x0) * CROP_MARGIN;
  const dy = (y1 - y0) * CROP_MARGIN;
  const left = Math.max(0, Math.floor(x0 - dx));
  const top = Math.max(0, Math.floor(y0 - dy));
  const right = Math.min(film.width, Math.ceil(x1 + dx));
  const bottom = Math.min(film.height, Math.ceil(y1 + dy));
  return { left, top, width: right - left, height: bottom - top };
}

/** A `side`-px square centred on `p`, shifted to stay inside the film. */
export function windowAround(
  p: { x: number; y: number },
  side: number,
  film: { width: number; height: number },
): Region {
  return {
    left: Math.round(clamp(p.x - side / 2, 0, film.width - side)),
    top: Math.round(clamp(p.y - side / 2, 0, film.height - side)),
    width: side,
    height: side,
  };
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Per landmark: the median x and median y of the runs that returned it.
 * Confidence is the runs' mean confidence, reduced by how far the furthest
 * run lies from the median (zero at SPREAD_LIMIT × `longEdge`), floored at
 * MIN_CONFIDENCE.
 */
export function combineRuns(runs: LandmarkPoints[], longEdge: number): LandmarkPoints {
  const ids = [...new Set(runs.flatMap((r) => [...r.keys()]))].sort((a, b) => a - b);
  const out: LandmarkPoints = new Map();
  for (const id of ids) {
    const pts = runs.map((r) => r.get(id)).filter((p): p is PointEstimate => p !== undefined);
    const x = median(pts.map((p) => p.x));
    const y = median(pts.map((p) => p.y));
    const spread = Math.max(...pts.map((p) => Math.hypot(p.x - x, p.y - y)));
    const meanConfidence = pts.reduce((sum, p) => sum + p.confidence, 0) / pts.length;
    const confidence = clamp01(meanConfidence * (1 - spread / (SPREAD_LIMIT * longEdge)));
    out.set(id, { x, y, confidence: Math.max(MIN_CONFIDENCE, confidence) });
  }
  return out;
}

/** Ids in an adjacent pair that breaks the S2-level order 14 < 11 < 13 < 7 < 15 < 12 < 16 (by x). */
export function orderViolations(points: ReadonlyMap<number, { x: number }>): Set<number> {
  const present = S2_ORDER.flatMap((id) => {
    const p = points.get(id);
    return p ? [{ id, x: p.x }] : [];
  });
  const bad = new Set<number>();
  for (let i = 1; i < present.length; i++) {
    if (present[i - 1].x >= present[i].x) {
      bad.add(present[i - 1].id);
      bad.add(present[i].id);
    }
  }
  return bad;
}

// ─── Upright frame ───

/**
 * Upright-film point → decoded-film point. The upright film is the decoded
 * one flipped vertically (if `flipV`) then rotated clockwise, i.e. the
 * viewer's display = C + R·S·(p − C) shifted so its box starts at (0, 0).
 */
function fromUpright(q: Point, decoded: Size, upright: Size, view: PelvisAnalysisView): Point {
  const display = {
    x: q.x + (decoded.width - upright.width) / 2,
    y: q.y + (decoded.height - upright.height) / 2,
  };
  return unorientPoint(display, {
    flipH: false,
    flipV: view.flipV,
    rotation: view.rotation,
    width: decoded.width,
    height: decoded.height,
  });
}

interface StoredMapping {
  /** Upright-film point → stored-image point. */
  map: (q: Point) => Point;
  /** Stored image size (the decoded size when the X-ray's size isn't recorded). */
  size: Size;
}

/**
 * Upright film → stored image: undo the view, then scale per axis by
 * stored / decoded size (they differ when the record's width and height
 * don't match the file).
 */
function storedMapping(
  decoded: Size,
  upright: Size,
  view: PelvisAnalysisView,
  stored?: Size | null,
): StoredMapping {
  const size = stored ?? decoded;
  const sx = size.width / decoded.width;
  const sy = size.height / decoded.height;
  if (Math.abs(sx / sy - 1) > ASPECT_TOLERANCE) {
    console.warn(
      `pelvis AI: stored size ${size.width}x${size.height} and decoded size ${decoded.width}x${decoded.height} have different aspect ratios`,
    );
  }
  return {
    size,
    map: (q) => {
      const p = fromUpright(q, decoded, upright, view);
      return { x: p.x * sx, y: p.y * sy };
    },
  };
}

// ─── Suitability ───

const VIEW_NEEDED = "the analysis needs an AP (front-to-back) view of the pelvis.";

const REQUIRED_VISIBLE: [keyof PelvisImageAssessment["visible"], string][] = [
  ["iliacCrests", "The iliac crests are not fully in the image."],
  ["femoralHeads", "The femoral heads are not fully in the image."],
  ["sacrum", "The sacrum is not fully in the image."],
  ["pubicSymphysis", "The pubic symphysis is not in the image."],
];

export interface Suitability {
  suitable: boolean;
  /** Why it was rejected, one plain sentence per failed rule. */
  reasons: string[];
  /** Caveats on an accepted film. */
  warnings: string[];
}

/**
 * Accept only an upright AP/PA radiograph showing the paper's region (iliac
 * crests to femoral heads, with the sacrum and symphysis), no hip implant,
 * bone outlines traceable and a located pelvis. Ischial tuberosities are
 * optional (they only feed IM).
 */
export function decideSuitability(a: PelvisImageAssessment): Suitability {
  if (!a.isRadiograph) {
    return { suitable: false, reasons: ["This doesn't look like an X-ray."], warnings: [] };
  }
  const reasons: string[] = [];
  if (a.projection === "lateral" || a.projection === "oblique") {
    reasons.push(`This looks like ${a.projection === "lateral" ? "a lateral" : "an oblique"} view; ${VIEW_NEEDED}`);
  } else if (a.projection !== "AP" && a.projection !== "PA") {
    reasons.push(`The view couldn't be confirmed as AP; ${VIEW_NEEDED}`);
  }
  const missing = REQUIRED_VISIBLE.filter(([key]) => !a.visible[key]).map(([, reason]) => reason);
  if (missing.length === REQUIRED_VISIBLE.length) {
    reasons.push("The pelvis isn't in this image; the analysis needs the region from the iliac crests to the femoral heads.");
  } else {
    if (!a.upright) {
      reasons.push("The film appears rotated or upside down. Rotate it upright in the viewer, then run the analysis again.");
    }
    reasons.push(...missing);
  }
  if (missing.length === 0 && !a.pelvisBox) reasons.push("The pelvis couldn't be located in the image.");
  if (a.hipImplant) reasons.push("A hip implant is present; the paper's method excludes films with implants.");
  if (a.quality === "poor") reasons.push("The image quality is too poor to trace the bone outlines.");

  const warnings: string[] = [];
  if (!a.visible.ischialTuberosities) {
    warnings.push("The ischial tuberosities are outside the film, so IM can't be measured.");
  }
  if (a.overlays) warnings.push("The film already has marks drawn on it; check each landmark.");
  if (a.quality === "fair") warnings.push("Image quality is fair; check each landmark.");
  return { suitable: reasons.length === 0, reasons, warnings };
}

/** Image side holding the patient's right: from the side marker, else the standard AP convention (image left). */
export function sideFromMarker(
  marker: PelvisImageAssessment["sideMarker"],
): Pick<DetectLandmarksResponse, "patientRightOn" | "sideSource"> {
  if (!marker) return { patientRightOn: "left", sideSource: "assumed" };
  const opposite = marker.imageSide === "left" ? "right" : "left";
  return { patientRightOn: marker.letter === "R" ? marker.imageSide : opposite, sideSource: "marker" };
}

// ─── Model output parsing ───

const PROJECTIONS = ["AP", "PA", "lateral", "oblique", "other", "unknown"] as const;
const REGIONS = ["pelvis", "full_spine", "lumbar", "hip", "chest", "other"] as const;
const QUALITIES = ["good", "fair", "poor"] as const;

function parseBox(v: unknown, frame: Frame): Box | null {
  if (!isRecord(v)) return null;
  const [x0, y0, x1, y1] = [v.x0, v.y0, v.x1, v.y1].map(num);
  if (x0 === null || y0 === null || x1 === null || y1 === null) return null;
  const a = toOriginal(frame, Math.min(x0, x1), Math.min(y0, y1));
  const b = toOriginal(frame, Math.max(x0, x1), Math.max(y0, y1));
  const right = frame.left + frame.width;
  const bottom = frame.top + frame.height;
  const box: Box = [
    Math.round(clamp(a.x, frame.left, right)),
    Math.round(clamp(a.y, frame.top, bottom)),
    Math.round(clamp(b.x, frame.left, right)),
    Math.round(clamp(b.y, frame.top, bottom)),
  ];
  return box[2] - box[0] >= MIN_PELVIS_BOX && box[3] - box[1] >= MIN_PELVIS_BOX ? box : null;
}

/** Pass-1 answer → assessment, with the pelvis box mapped to original pixels. */
export function parseAssessment(value: unknown, frame: Frame): PelvisImageAssessment {
  if (!isRecord(value)) {
    throw new VisionApiError("vision_api_error", "The AI returned an unexpected image assessment.");
  }
  const visible: Record<string, unknown> = isRecord(value.visible) ? value.visible : {};
  const marker = isRecord(value.sideMarker) ? value.sideMarker : null;
  const letter = marker?.letter;
  const markerSide = marker?.imageSide;
  return {
    isRadiograph: value.isRadiograph === true,
    projection: oneOf(value.projection, PROJECTIONS, "unknown"),
    region: oneOf(value.region, REGIONS, "other"),
    upright: value.upright === true,
    visible: {
      iliacCrests: visible.iliacCrests === true,
      femoralHeads: visible.femoralHeads === true,
      ischialTuberosities: visible.ischialTuberosities === true,
      sacrum: visible.sacrum === true,
      pubicSymphysis: visible.pubicSymphysis === true,
    },
    hipImplant: value.hipImplant === true,
    overlays: value.overlays === true,
    quality: oneOf(value.quality, QUALITIES, "poor"),
    sideMarker:
      (letter === "R" || letter === "L") && (markerSide === "left" || markerSide === "right")
        ? { letter, imageSide: markerSide }
        : null,
    pelvisBox: parseBox(value.pelvisBox, frame),
    notes: typeof value.notes === "string" ? value.notes : "",
  };
}

/** Pass-2 answer → points keyed by landmark id (unknown ids and duplicates dropped). */
export function parseLandmarkRun(value: unknown): LandmarkPoints {
  if (!isRecord(value) || !Array.isArray(value.landmarks)) {
    throw new VisionApiError("vision_api_error", "The AI returned an unexpected landmark list.");
  }
  const out: LandmarkPoints = new Map();
  for (const item of value.landmarks) {
    if (!isRecord(item)) continue;
    const id = num(item.id);
    const x = num(item.x);
    const y = num(item.y);
    if (id === null || !landmarkById(id) || out.has(id) || x === null || y === null) continue;
    out.set(id, { x, y, confidence: clamp01(num(item.confidence) ?? 0.5) });
  }
  return out;
}

function parsePoint(value: unknown): PointEstimate {
  const x = isRecord(value) ? num(value.x) : null;
  const y = isRecord(value) ? num(value.y) : null;
  if (!isRecord(value) || x === null || y === null) {
    throw new VisionApiError("vision_api_error", "The AI returned an unexpected point.");
  }
  return { x, y, confidence: clamp01(num(value.confidence) ?? 0.5) };
}

// ─── Prompts and output schemas ───

function assessPrompt(w: number, h: number): string {
  return [
    `This image (${w}x${h} pixels) was uploaded to a chiropractic clinic's X-ray viewer for AI analysis of pelvic alignment, which needs an anteroposterior (AP) pelvis or AP full-spine radiograph. Describe it. Origin is the top-left pixel; x grows right, y grows down.`,
    "- isRadiograph: true only for a medical X-ray image (not a photo, an app screenshot, a drawing or a document).",
    "- projection: AP, PA, lateral, oblique, other or unknown.",
    "- region: pelvis, full_spine, lumbar, hip, chest or other.",
    "- upright: Is the pelvis upright: iliac crests toward the top of the image and femurs pointing down?",
    "- visible: for each structure, true only if it is fully inside the image, on BOTH sides for paired structures: iliacCrests, femoralHeads, ischialTuberosities, sacrum, pubicSymphysis.",
    "- hipImplant: a prosthesis, screws or plates at the hips or pelvis.",
    "- overlays: measurement lines or landmark dots drawn on the image. Side markers such as R or L do not count.",
    "- quality: good, fair or poor: can the bone outlines be traced?",
    "- sideMarker: the radiographic side marker's letter (R or L) and the image side (left or right half, as displayed) it sits on; null if there is no legible marker.",
    "- pelvisBox: a tight box {x0, y0, x1, y1} around the bony pelvis, including the iliac crests, femoral heads and ischial tuberosities, in this image's pixels; null if no pelvis is visible.",
    "- notes: one sentence on what the image shows.",
  ].join("\n");
}

function locatePrompt(w: number, h: number): string {
  return [
    "You analyse anteroposterior (AP) pelvic radiographs for a chiropractic clinic.",
    `The image is ${w}x${h} pixels. Origin is the top-left pixel; x grows right, y grows down. Report every coordinate in this pixel grid.`,
    "Sides are IMAGE sides: image-left is the left half of the picture as displayed (on a standard AP film that is the patient's right).",
    "Locate these 16 landmarks (Moon et al., Heliyon 2024). Each is a specific point on a bone edge, not the centre of a bone:",
    ...PELVIC_LANDMARKS.map((l) => `${l.id}. ${l.definition}`),
    PELVIC_LANDMARK_ORDER_RULE,
    "Give each landmark a confidence from 0 to 1.",
  ].join("\n");
}

function refinePrompt(
  frame: Frame,
  cross: { x: number; y: number },
  def: PelvicLandmarkDef,
  radius: number,
): string {
  return [
    `This is a ${frame.sentWidth}x${frame.sentHeight} px zoomed crop of an AP pelvic radiograph (origin top-left, x right, y down). Sides are IMAGE sides as displayed.`,
    `A magenta cross at (${cross.x}, ${cross.y}) marks a first estimate of this landmark: ${def.definition}`,
    `Look closely at the bone outline near the cross and give the landmark's exact position in this crop's pixel grid. It is within about ${radius} px of the cross; if the cross is already on the point, return the cross position.`,
  ].join("\n");
}

const NUMBER = { type: "number" } as const;
const BOOLEAN = { type: "boolean" } as const;

function object(properties: Record<string, unknown>) {
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

const ASSESSMENT_SCHEMA = object({
  isRadiograph: BOOLEAN,
  projection: { type: "string", enum: PROJECTIONS },
  region: { type: "string", enum: REGIONS },
  upright: BOOLEAN,
  visible: object({
    iliacCrests: BOOLEAN,
    femoralHeads: BOOLEAN,
    ischialTuberosities: BOOLEAN,
    sacrum: BOOLEAN,
    pubicSymphysis: BOOLEAN,
  }),
  hipImplant: BOOLEAN,
  overlays: BOOLEAN,
  quality: { type: "string", enum: QUALITIES },
  sideMarker: {
    anyOf: [
      object({
        letter: { type: "string", enum: ["R", "L"] },
        imageSide: { type: "string", enum: ["left", "right"] },
      }),
      { type: "null" },
    ],
  },
  pelvisBox: { anyOf: [object({ x0: NUMBER, y0: NUMBER, x1: NUMBER, y1: NUMBER }), { type: "null" }] },
  notes: { type: "string" },
});

const LOCATE_SCHEMA = object({
  landmarks: {
    type: "array",
    items: object({
      id: { type: "integer", enum: PELVIC_LANDMARKS.map((l) => l.id) },
      x: NUMBER,
      y: NUMBER,
      confidence: NUMBER,
    }),
  },
});

const POINT_SCHEMA = object({ x: NUMBER, y: NUMBER, confidence: NUMBER });

// ─── Image I/O ───

async function loadFilm(bytes: Buffer): Promise<Film> {
  const unreadable = new VisionApiError("invalid_image", "The image file couldn't be read.");
  const meta = await sharp(bytes).metadata().catch(() => {
    throw unreadable;
  });
  if (!meta.width || !meta.height) throw unreadable;
  if (Math.max(meta.width, meta.height) > MAX_DECODED_EDGE) {
    throw new VisionApiError(
      "image_too_large",
      `The image is ${meta.width}x${meta.height} px; the limit is ${MAX_DECODED_EDGE} px on the long edge.`,
    );
  }
  try {
    const { data, info } = await sharp(bytes, { failOn: "none" })
      .rotate()
      .removeAlpha()
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { pixels: data, width: info.width, height: info.height };
  } catch {
    throw unreadable;
  }
}

/** One sharp operation on a film, back to 1-channel raw. */
async function filmStep(film: Film, op: (image: sharp.Sharp) => sharp.Sharp): Promise<Film> {
  const { data, info } = await op(sharp(film.pixels, { raw: { width: film.width, height: film.height, channels: 1 } }))
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { pixels: data, width: info.width, height: info.height };
}

/** The film as the viewer shows it, minus any horizontal flip: flipped vertically, then rotated clockwise (separate steps, so the order is certain). */
async function uprightFilm(film: Film, view: PelvisAnalysisView): Promise<Film> {
  const flipped = view.flipV ? await filmStep(film, (image) => image.flip()) : film;
  return view.rotation === 0 ? flipped : filmStep(flipped, (image) => image.rotate(view.rotation));
}

/** Cut `frame` out of the film, resize to its sent size, stretch contrast, JPEG. */
async function renderFrame(film: Film, frame: Frame, cross?: { x: number; y: number }): Promise<Buffer> {
  let image = sharp(film.pixels, { raw: { width: film.width, height: film.height, channels: 1 } })
    .extract({ left: frame.left, top: frame.top, width: frame.width, height: frame.height })
    .resize({ width: frame.sentWidth, height: frame.sentHeight, fit: "fill" })
    .normalize();
  if (cross) image = image.composite([{ input: crossSvg(frame, cross) }]);
  // 4:4:4 keeps the thin magenta cross crisp; gray pixels cost nothing extra.
  return image.jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
}

/** Magenta cross, 10 px arms with a gap in the middle so the point itself stays visible. */
function crossSvg(frame: Frame, { x, y }: { x: number; y: number }): Buffer {
  const arm = 10;
  const gap = 3;
  const d =
    `M${x - gap - arm} ${y}H${x - gap}M${x + gap} ${y}H${x + gap + arm}` +
    `M${x} ${y - gap - arm}V${y - gap}M${x} ${y + gap}V${y + gap + arm}`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.sentWidth}" height="${frame.sentHeight}"><path d="${d}" stroke="#ff00ff" stroke-width="2" fill="none"/></svg>`,
  );
}

// ─── Model calls ───

/** Signal, retries and a timeout that ends the call DEADLINE_MARGIN before the deadline; throws once time is up. */
function requestOptions(call: Call, maxRetries: number) {
  const timeout = Math.min(CALL_TIMEOUT, call.deadline - Date.now() - DEADLINE_MARGIN);
  if (call.signal?.aborted || timeout <= 0) throw new VisionApiError("timeout", TIMEOUT_MESSAGE);
  return { timeout, maxRetries, signal: call.signal };
}

async function askJson(
  call: Call,
  image: Buffer,
  text: string,
  effort: Effort,
  schema: Record<string, unknown>,
  maxRetries: number,
): Promise<unknown> {
  const options = requestOptions(call, maxRetries);
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await call.client.beta.messages.create(
      {
        model: VISION_MODEL,
        max_tokens: MAX_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort, format: { type: "json_schema", schema } },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image.toString("base64") } },
              { type: "text", text },
            ],
          },
        ],
      },
      options,
    );
  } catch (err) {
    if (
      err instanceof Anthropic.APIUserAbortError ||
      err instanceof Anthropic.APIConnectionTimeoutError ||
      call.signal?.aborted
    ) {
      throw new VisionApiError("timeout", TIMEOUT_MESSAGE);
    }
    if (err instanceof Anthropic.APIError) {
      // Anthropic's message stays in the server log; the client gets a generic one.
      console.error("pelvis AI request failed:", { status: err.status, requestID: err.requestID, message: err.message });
      throw err instanceof Anthropic.RateLimitError
        ? new VisionApiError("rate_limited", RATE_LIMITED_MESSAGE)
        : new VisionApiError("vision_api_error", API_ERROR_MESSAGE);
    }
    throw err;
  }
  if (response.stop_reason === "refusal") {
    throw new VisionApiError("vision_api_error", "The AI model declined to analyse this image.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new VisionApiError("vision_api_error", "The AI response was cut off before it finished.");
  }
  const block = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text");
  if (!block) throw new VisionApiError("vision_api_error", "The AI response had no answer.");
  try {
    return JSON.parse(block.text) as unknown;
  } catch {
    throw new VisionApiError("vision_api_error", "The AI returned malformed JSON.");
  }
}

/** Pass 1: what is this image, and where is the pelvis? */
async function assessImage(call: Call, film: Film): Promise<PelvisImageAssessment> {
  const frame = standardFrame({ left: 0, top: 0, width: film.width, height: film.height });
  const image = await renderFrame(film, frame);
  const answer = await askJson(call, image, assessPrompt(frame.sentWidth, frame.sentHeight), "low", ASSESSMENT_SCHEMA, 1);
  return parseAssessment(answer, frame);
}

/** Pass 2: all 16 landmarks on the pelvis crop, median of parallel runs; film px. No retries: one failed run of three is tolerated. */
async function locateLandmarks(
  call: Call,
  film: Film,
  pelvisBox: Box,
): Promise<{ points: LandmarkPoints; crop: Frame }> {
  const crop = standardFrame(expandBox(pelvisBox, film));
  const image = await renderFrame(film, crop);
  const prompt = locatePrompt(crop.sentWidth, crop.sentHeight);
  const settled = await Promise.allSettled(
    Array.from({ length: LOCATE_RUNS }, () =>
      askJson(call, image, prompt, "high", LOCATE_SCHEMA, 0).then(parseLandmarkRun),
    ),
  );
  const runs = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  if (runs.length < 2) {
    const failure = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
    throw failure?.reason instanceof VisionApiError
      ? failure.reason
      : new VisionApiError("vision_api_error", "Landmark detection failed.");
  }

  const combined = combineRuns(runs, Math.max(crop.sentWidth, crop.sentHeight));
  const outOfOrder = orderViolations(combined);
  const points: LandmarkPoints = new Map();
  for (const [id, p] of combined) {
    const confidence = outOfOrder.has(id) ? Math.max(MIN_CONFIDENCE, p.confidence * 0.5) : p.confidence;
    points.set(id, { ...toOriginal(crop, p.x, p.y), confidence });
  }
  return { points, crop };
}

/**
 * Pass 3: a zoomed second look at each bone-edge landmark; keeps the pass-2
 * point on failure or a jump. No retries. Confidence can only stay or drop:
 * the runs' disagreement in pass 2 still stands.
 */
async function refineLandmarks(
  call: Call,
  film: Film,
  { points, crop }: { points: LandmarkPoints; crop: Frame },
): Promise<LandmarkPoints> {
  const cropLong = Math.max(crop.width, crop.height);
  const pass2Scale = Math.max(crop.sentWidth, crop.sentHeight) / cropLong;
  const side = Math.min(Math.round(REFINE_WINDOW * cropLong), film.width, film.height);
  const targetEdge = Math.min(MAX_SENT_EDGE, Math.round(2 * side * pass2Scale));
  const refined: LandmarkPoints = new Map(points);

  await Promise.all(
    PELVIC_LANDMARKS.filter((def) => REFINE_IDS.has(def.id) && points.has(def.id)).map(async (def) => {
      const p = points.get(def.id);
      if (!p) return;
      try {
        const frame = fitFrame(windowAround(p, side, film), targetEdge);
        const sent = toSent(frame, p.x, p.y);
        const cross = { x: Math.round(sent.x), y: Math.round(sent.y) };
        const radius = Math.round((REFINE_HINT * cropLong * frame.sentWidth) / frame.width);
        const image = await renderFrame(film, frame, cross);
        const answer = parsePoint(
          await askJson(call, image, refinePrompt(frame, cross, def, radius), "medium", POINT_SCHEMA, 0),
        );
        const moved = toOriginal(frame, answer.x, answer.y);
        if (Math.hypot(moved.x - p.x, moved.y - p.y) < REFINE_MAX_MOVE * cropLong) {
          refined.set(def.id, { ...moved, confidence: Math.min(p.confidence, answer.confidence * 0.9) });
        }
      } catch (err) {
        if (!call.signal?.aborted) {
          console.warn(`pelvis refine of landmark ${def.id} failed; keeping the first estimate:`, err);
        }
      }
    }),
  );
  return refined;
}

function toDetected(points: LandmarkPoints, stored: StoredMapping): DetectedLandmark[] {
  return PELVIC_LANDMARKS.flatMap((def) => {
    const p = points.get(def.id);
    if (!p) return [];
    const s = stored.map(p);
    return [
      {
        id: def.id,
        key: def.key,
        x: clamp(s.x, 0, stored.size.width),
        y: clamp(s.y, 0, stored.size.height),
        confidence: p.confidence,
      },
    ];
  });
}

/** The assessment with its pelvis box moved from the upright film to stored pixels. */
function storedAssessment(a: PelvisImageAssessment, stored: StoredMapping): PelvisImageAssessment {
  if (!a.pelvisBox) return a;
  const [x0, y0, x1, y1] = a.pelvisBox;
  const p = stored.map({ x: x0, y: y0 });
  const q = stored.map({ x: x1, y: y1 });
  return {
    ...a,
    pelvisBox: [
      Math.round(Math.min(p.x, q.x)),
      Math.round(Math.min(p.y, q.y)),
      Math.round(Math.max(p.x, q.x)),
      Math.round(Math.max(p.y, q.y)),
    ],
  };
}

/**
 * Gate, then locate and refine the 16 landmarks on the film turned upright
 * by `view`. Coordinates (landmarks and the pelvis box) come back in the
 * STORED image's pixels: EXIF orientation applied, as browsers show it,
 * scaled to `storedSize` when given. Image sides in landmark keys and the
 * side marker are those of the upright film.
 */
export async function analysePelvis(opts: {
  imageBytes: Buffer;
  /** The viewer's rotation and vertical flip; default upright as stored. */
  view?: PelvisAnalysisView;
  /** The X-ray's recorded width and height; null or omitted keeps the decoded size. */
  storedSize?: Size | null;
  /** Aborts every model call: the client went away or the deadline passed. */
  signal?: AbortSignal;
  /** Epoch ms by which the analysis must be done. */
  deadlineMs?: number;
  /** Tests inject a mock; production omits it. */
  client?: Anthropic;
}): Promise<PelvisAnalysis> {
  const call: Call = {
    client: opts.client ?? new Anthropic(),
    signal: opts.signal,
    deadline: opts.deadlineMs ?? Infinity,
  };
  const view = opts.view ?? { rotation: 0, flipV: false };
  const decoded = await loadFilm(opts.imageBytes);
  const film = await uprightFilm(decoded, view);
  const stored = storedMapping(decoded, film, view, opts.storedSize);

  const assessment = await assessImage(call, film);
  const verdict = decideSuitability(assessment);
  if (!verdict.suitable || !assessment.pelvisBox) {
    return { kind: "rejected", assessment: storedAssessment(assessment, stored), reasons: verdict.reasons };
  }

  const located = await locateLandmarks(call, film, assessment.pelvisBox);
  if (!assessment.visible.ischialTuberosities) {
    for (const id of ISCHIAL_IDS) located.points.delete(id);
  }
  let refined = located.points;
  const remaining = call.deadline - Date.now();
  if (remaining >= REFINE_MIN_REMAINING) {
    refined = await refineLandmarks(call, film, located);
  } else {
    console.warn(`pelvis AI: ${Math.round(remaining / 1000)} s left, skipping refinement`);
  }

  return {
    kind: "accepted",
    landmarks: toDetected(refined, stored),
    assessment: storedAssessment(assessment, stored),
    ...sideFromMarker(assessment.sideMarker),
    warnings: verdict.warnings,
    model: VISION_MODEL,
  };
}
