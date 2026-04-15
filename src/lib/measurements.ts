import type { Point } from "@/types/annotation";

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
