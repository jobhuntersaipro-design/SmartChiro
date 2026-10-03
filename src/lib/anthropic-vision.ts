import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import {
  PELVIC_LANDMARKS,
  PELVIC_LANDMARK_ORDER_RULE,
  landmarkById,
  type PelvicLandmarkDef,
} from "@/lib/pelvic-landmarks";
import type {
  DetectLandmarksResponse,
  DetectedLandmark,
  PelvisImageAssessment,
} from "@/types/pelvis";

/**
 * AI pelvic landmark detection on AP pelvis / AP full-spine radiographs,
 * after Moon et al., Heliyon 2024 (PMC11040132): 16 landmarks, from which
 * `pelvic-analysis.ts` computes the paper's 10 parameters.
 *
 * Three passes, each a Claude vision call with structured JSON output:
 *   1. Assess (effort low): the whole film, downscaled. Is it an AP pelvis we
 *      can analyse, where is the bony pelvis, is there a side marker?
 *      `decideSuitability` turns the answer into accept / reject in code.
 *   2. Locate (effort high): crop to the pelvis box + 6%, ask for all 16
 *      points 3 times in parallel and take the per-axis median. Runs that
 *      disagree lower the confidence, and so does breaking the
 *      left-to-right order along S2.
 *   3. Refine (effort medium): bone-edge points 1-6 and 8 only, each in a
 *      2x zoomed window with a magenta cross on the estimate. Small moves are
 *      kept, jumps ignored. (Refining 14/16 and the sacral group made them
 *      worse in evaluation.)
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
 * ORIGINAL image pixels.
 */

export const VISION_MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_TOKENS = 16000;
const REQUEST_OPTIONS = { timeout: 60_000, maxRetries: 1 };

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
    public readonly code: "image_too_large" | "invalid_image" | "vision_api_error" | "rate_limited",
    message: string,
  ) {
    super(message);
    this.name = "VisionApiError";
  }
}

/** Auto-oriented 8-bit grayscale pixels in the original image's grid. */
interface Film {
  pixels: Buffer;
  width: number;
  height: number;
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
 * Accept only an AP/PA radiograph showing the paper's region (iliac crests
 * to femoral heads, with the sacrum and symphysis), no hip implant, bone
 * outlines traceable and a located pelvis. Ischial tuberosities are optional
 * (they only feed IM).
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

async function askJson(
  client: Anthropic,
  image: Buffer,
  text: string,
  effort: Effort,
  schema: Record<string, unknown>,
): Promise<unknown> {
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create(
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
      REQUEST_OPTIONS,
    );
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new VisionApiError("rate_limited", "The AI service is busy; try again in a minute.");
    }
    if (err instanceof Anthropic.APIError) {
      throw new VisionApiError("vision_api_error", `The AI request failed: ${err.message}`);
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
async function assessImage(client: Anthropic, film: Film): Promise<PelvisImageAssessment> {
  const frame = standardFrame({ left: 0, top: 0, width: film.width, height: film.height });
  const image = await renderFrame(film, frame);
  const answer = await askJson(client, image, assessPrompt(frame.sentWidth, frame.sentHeight), "low", ASSESSMENT_SCHEMA);
  return parseAssessment(answer, frame);
}

/** Pass 2: all 16 landmarks on the pelvis crop, median of parallel runs; original px. */
async function locateLandmarks(
  client: Anthropic,
  film: Film,
  pelvisBox: Box,
): Promise<{ points: LandmarkPoints; crop: Frame }> {
  const crop = standardFrame(expandBox(pelvisBox, film));
  const image = await renderFrame(film, crop);
  const prompt = locatePrompt(crop.sentWidth, crop.sentHeight);
  const settled = await Promise.allSettled(
    Array.from({ length: LOCATE_RUNS }, () =>
      askJson(client, image, prompt, "high", LOCATE_SCHEMA).then(parseLandmarkRun),
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

/** Pass 3: a zoomed second look at each bone-edge landmark; keeps the pass-2 point on failure or a jump. */
async function refineLandmarks(
  client: Anthropic,
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
          await askJson(client, image, refinePrompt(frame, cross, def, radius), "medium", POINT_SCHEMA),
        );
        const moved = toOriginal(frame, answer.x, answer.y);
        if (Math.hypot(moved.x - p.x, moved.y - p.y) < REFINE_MAX_MOVE * cropLong) {
          refined.set(def.id, { ...moved, confidence: Math.max(p.confidence, answer.confidence * 0.9) });
        }
      } catch (err) {
        console.warn(`pelvis refine of landmark ${def.id} failed; keeping the first estimate:`, err);
      }
    }),
  );
  return refined;
}

function toDetected(points: LandmarkPoints, film: Film): DetectedLandmark[] {
  return PELVIC_LANDMARKS.flatMap((def) => {
    const p = points.get(def.id);
    if (!p) return [];
    return [
      {
        id: def.id,
        key: def.key,
        x: clamp(p.x, 0, film.width),
        y: clamp(p.y, 0, film.height),
        confidence: p.confidence,
      },
    ];
  });
}

/**
 * Gate, then locate and refine the 16 landmarks. Coordinates come back in
 * the original image's pixels (EXIF orientation applied, as browsers show
 * it); dimensions are read from the bytes, not the database.
 */
export async function analysePelvis(opts: {
  imageBytes: Buffer;
  /** Tests inject a mock; production omits it. */
  client?: Anthropic;
}): Promise<PelvisAnalysis> {
  const client = opts.client ?? new Anthropic();
  const film = await loadFilm(opts.imageBytes);

  const assessment = await assessImage(client, film);
  const verdict = decideSuitability(assessment);
  if (!verdict.suitable || !assessment.pelvisBox) {
    return { kind: "rejected", assessment, reasons: verdict.reasons };
  }

  const located = await locateLandmarks(client, film, assessment.pelvisBox);
  if (!assessment.visible.ischialTuberosities) {
    for (const id of ISCHIAL_IDS) located.points.delete(id);
  }
  const refined = await refineLandmarks(client, film, located);

  return {
    kind: "accepted",
    landmarks: toDetected(refined, film),
    assessment,
    ...sideFromMarker(assessment.sideMarker),
    warnings: verdict.warnings,
    model: VISION_MODEL,
  };
}
