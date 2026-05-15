import type { BaseShape, Point, ShapeMeasurement } from "@/types/annotation";
import { computeBoundingBox } from "@/types/annotation";

/**
 * Compute ruler (distance) measurement between two points (pixel-based).
 */
export function computeRulerMeasurement(
  p1: Point,
  p2: Point
): { pixelLength: number; label: string; unit: "px" } {
  const pixelLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  return { pixelLength, label: `${Math.round(pixelLength)} px`, unit: "px" };
}

/**
 * Compute angle measurement from three points: A (ray start), V (vertex), C (ray end).
 */
export function computeAngleMeasurement(
  a: Point,
  v: Point,
  c: Point
): { degrees: number; supplementary: number; label: string } {
  const v1 = { x: a.x - v.x, y: a.y - v.y };
  const v2 = { x: c.x - v.x, y: c.y - v.y };
  const cross = v1.x * v2.y - v1.y * v2.x;
  const dot = v1.x * v2.x + v1.y * v2.y;
  const angle = Math.abs(Math.atan2(cross, dot));
  const degrees = angle * (180 / Math.PI);
  const supplementary = 180 - degrees;
  return { degrees, supplementary, label: `${degrees.toFixed(1)}°` };
}

/**
 * Compute Cobb angle from two lines (4 points: line1 start/end, line2 start/end).
 * Returns the angle between perpendiculars to the two lines, plus classification.
 */
export function computeCobbAngle(
  l1p1: Point, l1p2: Point,
  l2p1: Point, l2p2: Point
): {
  degrees: number;
  classification: string;
  perp1: [number, number, number, number];
  perp2: [number, number, number, number];
  intersection: [number, number];
} {
  // Direction vectors
  const dir1 = { x: l1p2.x - l1p1.x, y: l1p2.y - l1p1.y };
  const dir2 = { x: l2p2.x - l2p1.x, y: l2p2.y - l2p1.y };

  // Perpendicular directions (rotate 90°)
  const perp1Dir = { x: -dir1.y, y: dir1.x };
  const perp2Dir = { x: -dir2.y, y: dir2.x };

  // Midpoints
  const mid1 = { x: (l1p1.x + l1p2.x) / 2, y: (l1p1.y + l1p2.y) / 2 };
  const mid2 = { x: (l2p1.x + l2p2.x) / 2, y: (l2p1.y + l2p2.y) / 2 };

  // Find intersection: mid1 + t * perp1Dir = mid2 + s * perp2Dir
  const denom = perp1Dir.x * perp2Dir.y - perp1Dir.y * perp2Dir.x;
  let intersectionPt: [number, number];
  if (Math.abs(denom) < 0.001) {
    // Parallel lines — place intersection at midpoint between the two midpoints
    intersectionPt = [(mid1.x + mid2.x) / 2, (mid1.y + mid2.y) / 2];
  } else {
    const t = ((mid2.x - mid1.x) * perp2Dir.y - (mid2.y - mid1.y) * perp2Dir.x) / denom;
    intersectionPt = [mid1.x + t * perp1Dir.x, mid1.y + t * perp1Dir.y];
  }

  // Cobb angle = angle between perpendiculars
  const dot = perp1Dir.x * perp2Dir.x + perp1Dir.y * perp2Dir.y;
  const mag1 = Math.hypot(perp1Dir.x, perp1Dir.y);
  const mag2 = Math.hypot(perp2Dir.x, perp2Dir.y);
  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  const degrees = Math.acos(cosAngle) * (180 / Math.PI);

  const classification = degrees < 10 ? "Mild" : degrees <= 25 ? "Moderate" : "Severe";

  // Perpendicular lines for rendering (from midpoint to intersection)
  const perp1Line: [number, number, number, number] = [mid1.x, mid1.y, intersectionPt[0], intersectionPt[1]];
  const perp2Line: [number, number, number, number] = [mid2.x, mid2.y, intersectionPt[0], intersectionPt[1]];

  return { degrees, classification, perp1: perp1Line, perp2: perp2Line, intersection: intersectionPt };
}

/**
 * Compute axis-aligned rectangle area in pixels\u00B2 from bounding box dimensions.
 */
export function computeRectArea(
  width: number,
  height: number
): { pixelArea: number; label: string; unit: "px\u00B2" } {
  const pixelArea = Math.max(0, width) * Math.max(0, height);
  return { pixelArea, label: `${Math.round(pixelArea)} px\u00B2`, unit: "px\u00B2" };
}

/**
 * Compute ellipse area in pixels\u00B2 from bounding box dimensions.
 * Area = \u03C0 \u00D7 (width / 2) \u00D7 (height / 2)
 */
export function computeEllipseArea(
  width: number,
  height: number
): { pixelArea: number; label: string; unit: "px\u00B2" } {
  const a = Math.max(0, width) / 2;
  const b = Math.max(0, height) / 2;
  const pixelArea = Math.PI * a * b;
  return { pixelArea, label: `${Math.round(pixelArea)} px\u00B2`, unit: "px\u00B2" };
}

/**
 * Format a measurement value for display.
 * Converts pixel values to mm/cm and pixel\u00B2 values to mm\u00B2/cm\u00B2 when calibrated.
 * Leaves degrees unchanged.
 */
export function formatMeasurement(
  pixelValue: number,
  unit: "px" | "mm" | "deg" | "px\u00B2" | "mm\u00B2",
  pixelsPerMm: number | null
): string {
  if (unit === "deg") {
    return `${pixelValue.toFixed(1)}\u00B0`;
  }
  if (unit === "px\u00B2" || unit === "mm\u00B2") {
    if (pixelsPerMm && pixelsPerMm > 0) {
      const mm2Value = pixelValue / (pixelsPerMm * pixelsPerMm);
      if (mm2Value >= 100) {
        return `${(mm2Value / 100).toFixed(1)} cm\u00B2`;
      }
      return `${mm2Value.toFixed(1)} mm\u00B2`;
    }
    return `${Math.round(pixelValue)} px\u00B2`;
  }
  if (pixelsPerMm && pixelsPerMm > 0) {
    const mmValue = pixelValue / pixelsPerMm;
    if (mmValue >= 10) {
      return `${(mmValue / 10).toFixed(1)} cm`;
    }
    return `${mmValue.toFixed(1)} mm`;
  }
  return `${Math.round(pixelValue)} px`;
}

/**
 * Recompute a measurement's display label based on calibration state.
 */
export function recalibrateMeasurement(
  measurement: ShapeMeasurement,
  pixelsPerMm: number | null
): ShapeMeasurement {
  const label = formatMeasurement(measurement.value, measurement.unit, pixelsPerMm);
  return {
    ...measurement,
    calibrated: pixelsPerMm !== null && pixelsPerMm > 0 && measurement.unit !== "deg",
    label,
  };
}

/**
 * Generate the next stable measurement ID for a shape kind, given the existing shapes.
 * Counts how many shapes of the same kind already exist and returns prefix + (n+1).
 *   line / polyline → L#
 *   ruler           → L# (treated as a line measurement for printing)
 *   angle           → A#
 *   cobb_angle      → C#
 *   rectangle       → R#
 *   ellipse         → E#
 * Returns null for shape kinds that don't get printed (text, freehand).
 */
export function getMeasurementIdPrefix(shapeType: string): string | null {
  switch (shapeType) {
    case "line":
    case "polyline":
    case "ruler":
      return "L";
    case "angle":
      return "A";
    case "cobb_angle":
      return "C";
    case "rectangle":
      return "R";
    case "ellipse":
      return "E";
    default:
      return null;
  }
}

export function nextMeasurementId(
  shapeType: string,
  existingShapes: { type: string; measurementId?: string }[]
): string | undefined {
  const prefix = getMeasurementIdPrefix(shapeType);
  if (!prefix) return undefined;
  const samePrefixCount = existingShapes.filter(
    (s) => getMeasurementIdPrefix(s.type) === prefix
  ).length;
  return `${prefix}${samePrefixCount + 1}`;
}

/**
 * Human-readable display type for a shape — what the user sees in the
 * Layers list. A 2-point polyline (drawn with the Line tool) reads as
 * "Line"; a 3+-point polyline stays "Polyline". cobb_angle becomes
 * "Cobb angle". Everything else is just the capitalized type name.
 */
export function effectiveDisplayType(shape: {
  type: string;
  points: { x: number; y: number }[];
}): string {
  if (shape.type === "polyline" && shape.points.length === 2) return "Line";
  return shape.type.charAt(0).toUpperCase() + shape.type.slice(1).replace("_", " ");
}

/**
 * Compute the next display label for a freshly-committed shape (e.g.
 * "Line 3" or "Polyline 2"). Uses max-of-existing + 1 PER display type
 * so the counter is strictly monotonic — deleting Line 1 and then drawing
 * another line still yields "Line 2", never re-using "Line 1". Only
 * considers shapes whose `label` already follows the auto-name pattern;
 * a user-renamed shape ("My adjustment") doesn't perturb the sequence.
 */
export function nextDisplayLabel(
  shape: { type: string; points: { x: number; y: number }[] },
  existingShapes: { label?: string | null; type: string; points: { x: number; y: number }[] }[],
): string {
  const displayType = effectiveDisplayType(shape);
  // Regex matches the trailing number on a label like "Line 3" or
  // "Polyline 12". The display type prefix must match exactly so renames
  // don't collide with another type's sequence.
  const pattern = new RegExp(`^${displayType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (\\d+)$`);
  let max = 0;
  for (const s of existingShapes) {
    if (!s.label) continue;
    // Match against the candidate's own display type — a polyline whose
    // 2-point shape was renamed isn't a "Line" sibling.
    if (effectiveDisplayType(s) !== displayType) continue;
    const m = s.label.match(pattern);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${displayType} ${max + 1}`;
}

/**
 * Find all shapes that have a `pointRefs` entry pointing at any vertex of
 * `targetShapeId`. Used by the cascade-delete dialog to warn the user before
 * removing a landmark that other measurements snap-followed, and by the
 * layers panel to render the "used by N" indicator.
 *
 * Returns an array of `{shape, vertexIndices}` — `vertexIndices` is the set
 * of dependent's own vertex indices that ref *into* the target shape (so the
 * dialog can describe "L3 endpoint #1 follows P3" if needed).
 */
export function findDependentsOfShape(
  targetShapeId: string,
  shapes: BaseShape[],
): Array<{ shape: BaseShape; vertexIndices: number[] }> {
  const out: Array<{ shape: BaseShape; vertexIndices: number[] }> = [];
  for (const s of shapes) {
    if (s.id === targetShapeId) continue;
    if (!s.pointRefs?.length) continue;
    const indices: number[] = [];
    for (let i = 0; i < s.pointRefs.length; i++) {
      const ref = s.pointRefs[i];
      if (ref && ref.shapeId === targetShapeId) indices.push(i);
    }
    if (indices.length > 0) out.push({ shape: s, vertexIndices: indices });
  }
  return out;
}

/**
 * Map `shapeId → number-of-shapes-that-reference-it` across all shapes. Used
 * by the layers panel to show "used by 3" badges on landmark rows so users
 * know deleting will impact dependents.
 */
export function buildDependentCounts(shapes: BaseShape[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of shapes) {
    if (!s.pointRefs?.length) continue;
    const referencedTargets = new Set<string>();
    for (const ref of s.pointRefs) {
      if (ref) referencedTargets.add(ref.shapeId);
    }
    // One dependent shape may ref the same target multiple times — count it
    // once so "used by N" reflects shape-count not ref-count.
    for (const targetId of referencedTargets) {
      counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Recompute bounding box and measurement-derived fields (angle endpoints,
 * cobb perpendiculars / intersection / classification / label) from the
 * shape's current `points`. Returns the original shape if the type doesn't
 * have derived fields. Used both by `resolveShapeRefs` (after resolving
 * pointRefs) and by `handleMoveVertex` (after a direct vertex drag) so the
 * canvas/measurement readout stays in sync with the geometry.
 */
export function recomputeShapeDerived(shape: BaseShape): BaseShape {
  const bb = computeBoundingBox(shape.points);
  const next: BaseShape = {
    ...shape,
    x: bb.x,
    y: bb.y,
    width: bb.width,
    height: bb.height,
  };

  if (shape.type === "angle" && shape.points.length >= 3 && shape.measurement) {
    const m = computeAngleMeasurement(shape.points[0], shape.points[1], shape.points[2]);
    next.measurement = {
      ...shape.measurement,
      value: m.degrees,
      label: m.label,
    };
  } else if (shape.type === "cobb_angle" && shape.points.length >= 4 && shape.measurement) {
    const pts = shape.points;
    const cobb = computeCobbAngle(pts[0], pts[1], pts[2], pts[3]);
    next.line1 = [pts[0].x, pts[0].y, pts[1].x, pts[1].y];
    next.line2 = [pts[2].x, pts[2].y, pts[3].x, pts[3].y];
    next.perpendicular1 = cobb.perp1;
    next.perpendicular2 = cobb.perp2;
    next.intersection = cobb.intersection;
    next.cobbClassification = cobb.classification;
    next.measurement = {
      ...shape.measurement,
      value: cobb.degrees,
      label: `${cobb.degrees.toFixed(1)}° — ${cobb.classification}`,
    };
  }

  return next;
}

/**
 * Resolve a shape's `pointRefs` against a map of all shapes, returning a new
 * shape whose `points` reflect the *current* positions of each referenced
 * source vertex. Bounding box and measurement-derived fields are recomputed
 * via `recomputeShapeDerived` when any ref resolved to a new position.
 *
 * If the shape has no refs, no refs resolved, or all refs resolved to the
 * same coords as the stored points, the original shape is returned (referential
 * equality preserved so React skips re-rendering downstream).
 *
 * If a referenced source shape was deleted or its vertex index is out of
 * bounds, that point falls back to the last-known stored coordinate — the
 * dependent measurement keeps showing where it was last drawn rather than
 * collapsing.
 */
export function resolveShapeRefs(
  shape: BaseShape,
  shapeMap: Map<string, BaseShape>
): BaseShape {
  if (!shape.pointRefs || shape.pointRefs.length === 0) return shape;
  // Cheap check: no non-null entries → no refs to resolve.
  if (!shape.pointRefs.some((r) => r != null)) return shape;

  let didChange = false;
  const newPoints: Point[] = shape.points.map((p, i) => {
    const ref = shape.pointRefs![i];
    if (!ref) return p;
    const source = shapeMap.get(ref.shapeId);
    if (!source) return p;
    const sourcePt = source.points[ref.vertexIndex];
    if (!sourcePt) return p;
    if (sourcePt.x !== p.x || sourcePt.y !== p.y) didChange = true;
    return { x: sourcePt.x, y: sourcePt.y };
  });
  if (!didChange) return shape;

  return recomputeShapeDerived({ ...shape, points: newPoints });
}

/** Shape kinds whose vertices receive global P-numbered labels. Pairs with
 *  SNAPPABLE_KINDS in useDrawingTools, with one intentional exception:
 *  `landmark` shapes ARE snap targets but show their anatomical name
 *  ("L femoral head" etc.) in place of a P# label, so they are excluded
 *  here to keep the P-numbering tidy. */
const LABELED_VERTEX_KINDS = new Set(["point", "line", "polyline", "angle", "cobb_angle", "ruler"]);

/** Returned by computeGlobalPointLabels for any vertex that snap-followed a
 *  landmark. The ShapeRenderer detects this and renders no inline label —
 *  just the endpoint dot — so the landmark's own anatomical name (which
 *  sits next to it) remains the only label for that point. UI consumers
 *  that DO want a user-friendly name (the layers-tab vertex chain, the
 *  cascade-delete dialog, etc.) should run the sentinel through
 *  `resolveLandmarkLabelForDisplay` to swap it for the landmark's own
 *  displayName ("Iliac crest 1" etc.). */
export const LANDMARK_LABEL_SENTINEL = "__landmark__";

/**
 * Replace a LANDMARK_LABEL_SENTINEL with the user-facing landmark name by
 * walking the shape's pointRefs. Returns the input unchanged for any other
 * label, and `undefined` when the ref cannot be resolved (caller falls back
 * to whatever default makes sense in their UI).
 */
export function resolveLandmarkLabelForDisplay(
  label: string | undefined,
  pointRefs: ({ shapeId: string; vertexIndex: number } | null | undefined)[] | undefined,
  vertexIndex: number,
  allShapes: BaseShape[],
): string | undefined {
  if (label !== LANDMARK_LABEL_SENTINEL) return label;
  const ref = pointRefs?.[vertexIndex];
  if (!ref) return undefined;
  const src = allShapes.find((s) => s.id === ref.shapeId);
  return src?.label ?? src?.landmarkName ?? undefined;
}

/**
 * Compute a global P-numbering for every vertex on every dot-bearing shape
 * (point, line, polyline, ruler, angle, cobb_angle).
 *
 * Vertices that snap-followed an existing landmark inherit the source's
 * label instead of getting a fresh number — so a ruler whose endpoints
 * snapped to P1 and P2 displays "P1—P2", not "P3—P4". Free vertices (not
 * snapped to anything) get the next available P# in createdAt order.
 *
 * Returns a Map keyed by shape id, valued as the array of labels in vertex
 * order.
 */
export function computeGlobalPointLabels<
  S extends {
    id: string;
    type: string;
    points: { x: number; y: number }[];
    pointRefs?: ({ shapeId: string; vertexIndex: number } | null)[];
    createdAt?: string | Date;
  }
>(shapes: S[]): Map<string, string[]> {
  const sorted = [...shapes].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
  const shapeById = new Map<string, S>();
  for (const s of sorted) shapeById.set(s.id, s);

  // Pass 1: assign fresh P# only to "owner" vertices (no ref). Ref'd vertices
  // get a placeholder we resolve in pass 2.
  const out = new Map<string, string[]>();
  let counter = 1;
  for (const s of sorted) {
    if (!LABELED_VERTEX_KINDS.has(s.type)) continue;
    const labels: string[] = [];
    for (let i = 0; i < s.points.length; i++) {
      const ref = s.pointRefs?.[i];
      labels.push(ref ? "" : `P${counter++}`);
    }
    out.set(s.id, labels);
  }

  // Pass 2: resolve ref'd vertices to the source's label. Recurses through
  // chains of refs (ref-of-ref) with a depth guard against accidental cycles.
  // Special case: a ref pointing to a `landmark` shape returns the sentinel
  // LANDMARK_LABEL_SENTINEL — the renderer translates that to "no label,
  // just the endpoint dot," because landmarks identify themselves with
  // their anatomical name rather than a P# number.
  function resolve(shapeId: string, vertexIndex: number, depth = 0): string {
    if (depth > 16) return `P?`;
    const labels = out.get(shapeId);
    const cached = labels?.[vertexIndex];
    if (cached) return cached;
    const shape = shapeById.get(shapeId);
    if (shape?.type === "landmark") return LANDMARK_LABEL_SENTINEL;
    if (!labels) return `P?`;
    const ref = shape?.pointRefs?.[vertexIndex];
    if (!ref) return `P?`;
    const resolved = resolve(ref.shapeId, ref.vertexIndex, depth + 1);
    labels[vertexIndex] = resolved; // memoize
    return resolved;
  }

  for (const s of sorted) {
    const labels = out.get(s.id);
    if (!labels) continue;
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] === "") labels[i] = resolve(s.id, i);
    }
  }

  return out;
}
