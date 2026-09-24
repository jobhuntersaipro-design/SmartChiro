/**
 * Pelvic alignment parameters computed from AI/manual landmarks.
 *
 * Sourced from the Heliyon paper referenced in the AI Landmark spec
 * (context/features/xray-new-phase-3-spec.md §Downstream measurements).
 * v1 ships the four parameters that depend on landmarks the model places
 * reliably enough to be useful:
 *
 *   - FHHD   femoral head height difference (vertical)
 *   - ICHD   iliac crest height difference (vertical)
 *   - ALFHRF angle between the femoral-head line and image horizontal
 *   - DOCS   horizontal distance from symphysis pubis to the S2 plumb
 *
 * IM / SAM / ISM are deferred until the sacrum landmark accuracy is good
 * enough to anchor them (see current-feature.md).
 *
 * All math runs in image-pixel coordinates with +Y pointing down (SVG/canvas
 * convention). Conversion to millimetres is a final pass that multiplies by
 * 1 / pixelsPerMm when calibration is available.
 */

export type LandmarkName =
  | "top_of_left_femoral_head"
  | "top_of_right_femoral_head"
  | "top_of_left_iliac_crest"
  | "top_of_right_iliac_crest"
  | "second_sacral_tubercle"
  | "center_of_symphysis_pubis";

export interface LandmarkPoint {
  name: string;
  x: number;
  y: number;
}

export interface ParamValueDistance {
  kind: "distance";
  pixels: number;
  mm: number | null;
}

export interface ParamValueAngle {
  kind: "angle";
  degrees: number;
}

export type ParamValue = ParamValueDistance | ParamValueAngle;

export interface ParamResult {
  /** Stable identifier (e.g., "FHHD"). */
  id: "FHHD" | "ICHD" | "ALFHRF" | "DOCS";
  /** Human-readable name for UI. */
  label: string;
  /** Short clinical description. */
  description: string;
  /**
   * Computed value, or `null` when one or more required landmarks are missing
   * from the current set. UI uses `missing` to nudge the user toward placing
   * the absent landmarks.
   */
  value: ParamValue | null;
  /** Landmark names that were required but not supplied. */
  missing: LandmarkName[];
}

export interface PelvicAnalysis {
  fhhd: ParamResult;
  ichd: ParamResult;
  alfhrf: ParamResult;
  docs: ParamResult;
}

/**
 * Build a quick-lookup map keyed by canonical landmark name. Latest entry
 * wins if duplicates appear, which mirrors how the canvas would resolve
 * collisions visually (last-drawn shape sits on top).
 */
function indexLandmarks(landmarks: readonly LandmarkPoint[]): Map<string, LandmarkPoint> {
  const map = new Map<string, LandmarkPoint>();
  for (const l of landmarks) map.set(l.name, l);
  return map;
}

function pickRequired(
  index: Map<string, LandmarkPoint>,
  names: readonly LandmarkName[],
): { points: LandmarkPoint[] | null; missing: LandmarkName[] } {
  const missing: LandmarkName[] = [];
  const points: LandmarkPoint[] = [];
  for (const n of names) {
    const p = index.get(n);
    if (!p) missing.push(n);
    else points.push(p);
  }
  return { points: missing.length === 0 ? points : null, missing };
}

function toMillimetres(pixels: number, pixelsPerMm: number | null | undefined): number | null {
  if (pixelsPerMm == null || pixelsPerMm <= 0 || !Number.isFinite(pixelsPerMm)) return null;
  return pixels / pixelsPerMm;
}

/**
 * Compute FHHD: |y_left_femoral_head − y_right_femoral_head|.
 *
 * Always positive — the parameter quantifies asymmetry, not direction.
 * In mm when calibrated, otherwise in pixels (the `mm` field is null).
 */
export function computeFHHD(
  landmarks: readonly LandmarkPoint[],
  pixelsPerMm: number | null = null,
): ParamResult {
  const idx = indexLandmarks(landmarks);
  const required: LandmarkName[] = ["top_of_left_femoral_head", "top_of_right_femoral_head"];
  const { points, missing } = pickRequired(idx, required);
  const base: Omit<ParamResult, "value"> = {
    id: "FHHD",
    label: "FHHD",
    description: "Femoral head height difference",
    missing,
  };
  if (!points) return { ...base, value: null };

  const [left, right] = points;
  const pixels = Math.abs(left.y - right.y);
  return {
    ...base,
    value: { kind: "distance", pixels, mm: toMillimetres(pixels, pixelsPerMm) },
  };
}

/** Compute ICHD: |y_left_iliac_crest − y_right_iliac_crest|. */
export function computeICHD(
  landmarks: readonly LandmarkPoint[],
  pixelsPerMm: number | null = null,
): ParamResult {
  const idx = indexLandmarks(landmarks);
  const required: LandmarkName[] = ["top_of_left_iliac_crest", "top_of_right_iliac_crest"];
  const { points, missing } = pickRequired(idx, required);
  const base: Omit<ParamResult, "value"> = {
    id: "ICHD",
    label: "ICHD",
    description: "Iliac crest height difference",
    missing,
  };
  if (!points) return { ...base, value: null };

  const [left, right] = points;
  const pixels = Math.abs(left.y - right.y);
  return {
    ...base,
    value: { kind: "distance", pixels, mm: toMillimetres(pixels, pixelsPerMm) },
  };
}

/**
 * Compute ALFHRF: signed angle between the line through the two femoral
 * heads and the image horizontal axis, in degrees.
 *
 * Sign convention: positive when the right femoral head sits LOWER on the
 * image than the left (i.e., the line tilts down on the right side). This
 * is independent of which point is passed first since we always orient by
 * left→right along the x-axis. Output is clamped to (−90°, +90°].
 */
export function computeALFHRF(landmarks: readonly LandmarkPoint[]): ParamResult {
  const idx = indexLandmarks(landmarks);
  const required: LandmarkName[] = ["top_of_left_femoral_head", "top_of_right_femoral_head"];
  const { points, missing } = pickRequired(idx, required);
  const base: Omit<ParamResult, "value"> = {
    id: "ALFHRF",
    label: "ALFHRF",
    description: "Angle of femoral head line vs horizontal",
    missing,
  };
  if (!points) return { ...base, value: null };

  const [left, right] = points;
  // Orient so the vector points from the leftmost to the rightmost head along
  // the image x-axis. The arctangent then yields the tilt relative to the
  // horizontal. We don't assume the names match screen position because a
  // flipped image (Flip H) would otherwise produce the wrong sign.
  const [a, b] = left.x <= right.x ? [left, right] : [right, left];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Degenerate case — two landmarks placed on top of each other.
  if (dx === 0 && dy === 0) {
    return { ...base, value: { kind: "angle", degrees: 0 } };
  }
  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { ...base, value: { kind: "angle", degrees } };
}

/**
 * Compute DOCS: horizontal distance from the symphysis pubis to the
 * vertical plumb through the second sacral tubercle.
 *
 * Defined as |x_symphysis − x_S2| in pixels. A perfectly aligned pelvis on
 * a true AP view returns 0. When calibrated, mm is populated.
 */
export function computeDOCS(
  landmarks: readonly LandmarkPoint[],
  pixelsPerMm: number | null = null,
): ParamResult {
  const idx = indexLandmarks(landmarks);
  const required: LandmarkName[] = ["center_of_symphysis_pubis", "second_sacral_tubercle"];
  const { points, missing } = pickRequired(idx, required);
  const base: Omit<ParamResult, "value"> = {
    id: "DOCS",
    label: "DOCS",
    description: "Symphysis pubis offset from S2 plumb",
    missing,
  };
  if (!points) return { ...base, value: null };

  const [symphysis, s2] = points;
  const pixels = Math.abs(symphysis.x - s2.x);
  return {
    ...base,
    value: { kind: "distance", pixels, mm: toMillimetres(pixels, pixelsPerMm) },
  };
}

/**
 * Run all four parameters at once. Used by the right-panel Pelvic Analysis
 * section, which re-runs this on every landmark drag so values update live.
 */
export function computePelvicAnalysis(
  landmarks: readonly LandmarkPoint[],
  pixelsPerMm: number | null = null,
): PelvicAnalysis {
  return {
    fhhd: computeFHHD(landmarks, pixelsPerMm),
    ichd: computeICHD(landmarks, pixelsPerMm),
    alfhrf: computeALFHRF(landmarks),
    docs: computeDOCS(landmarks, pixelsPerMm),
  };
}

/**
 * Format a parameter for display. Distance values prefer mm when calibrated,
 * fall back to px otherwise. Angles always show one decimal degree.
 * Returns `null` when the parameter could not be computed.
 */
export function formatParamValue(result: ParamResult): string | null {
  if (!result.value) return null;
  if (result.value.kind === "angle") {
    return `${result.value.degrees.toFixed(1)}°`;
  }
  if (result.value.mm != null) {
    return `${result.value.mm.toFixed(1)} mm`;
  }
  return `${result.value.pixels.toFixed(1)} px`;
}
