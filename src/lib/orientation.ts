import type { BaseShape, Point } from "@/types/annotation";

export type Rotation = 0 | 90 | 180 | 270;

/**
 * How the X-ray is shown on screen. Annotations are always stored in the
 * original image's pixel space; orientation only changes the view, so
 * flipping/rotating keeps every mark on the anatomy it was drawn on.
 *
 * Matches the CSS on the <img>: `rotate(r) scale(sx, sy)` about the image
 * centre, i.e. display = C + R·S·(p − C).
 */
export interface Orientation {
  flipH: boolean;
  flipV: boolean;
  rotation: Rotation;
  /** Original image size — the centre of rotation is (width/2, height/2). */
  width: number;
  height: number;
}

export function isIdentity(o: Orientation | null | undefined): boolean {
  return !o || (!o.flipH && !o.flipV && o.rotation === 0);
}

export function orientationCss(o: Pick<Orientation, "flipH" | "flipV" | "rotation">): string | undefined {
  const parts: string[] = [];
  if (o.rotation !== 0) parts.push(`rotate(${o.rotation}deg)`);
  if (o.flipH || o.flipV) parts.push(`scale(${o.flipH ? -1 : 1}, ${o.flipV ? -1 : 1})`);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

// Rotation by a multiple of 90° clockwise (screen y points down).
function rotate(v: Point, rotation: Rotation): Point {
  switch (rotation) {
    case 90:
      return { x: -v.y, y: v.x };
    case 180:
      return { x: -v.x, y: -v.y };
    case 270:
      return { x: v.y, y: -v.x };
    default:
      return v;
  }
}

const INVERSE: Record<Rotation, Rotation> = { 0: 0, 90: 270, 180: 180, 270: 90 };

/** Vector (no translation) from image space to display space. */
export function orientVector(v: Point, o: Orientation): Point {
  return rotate({ x: o.flipH ? -v.x : v.x, y: o.flipV ? -v.y : v.y }, o.rotation);
}

/** Vector from display space back to image space. */
export function unorientVector(v: Point, o: Orientation): Point {
  const r = rotate(v, INVERSE[o.rotation]);
  return { x: o.flipH ? -r.x : r.x, y: o.flipV ? -r.y : r.y };
}

export function orientPoint(p: Point, o: Orientation): Point {
  const cx = o.width / 2;
  const cy = o.height / 2;
  const d = orientVector({ x: p.x - cx, y: p.y - cy }, o);
  return { x: cx + d.x, y: cy + d.y };
}

export function unorientPoint(p: Point, o: Orientation): Point {
  const cx = o.width / 2;
  const cy = o.height / 2;
  const d = unorientVector({ x: p.x - cx, y: p.y - cy }, o);
  return { x: cx + d.x, y: cy + d.y };
}

/** Axis-aligned box in display space covering an image-space box. */
export function orientRect(
  rect: { x: number; y: number; width: number; height: number },
  o: Orientation,
): { x: number; y: number; width: number; height: number } {
  const a = orientPoint({ x: rect.x, y: rect.y }, o);
  const b = orientPoint({ x: rect.x + rect.width, y: rect.y + rect.height }, o);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/**
 * Shape as it should be drawn on the oriented view. Geometry moves; text
 * stays upright and readable (its box keeps its size, centred on the mapped
 * centre) — unlike CSS-transforming the SVG, which would mirror labels.
 */
export function orientShape<T extends BaseShape>(shape: T, o: Orientation | null | undefined): T {
  if (!o || isIdentity(o)) return shape;
  const points = shape.points.map((p) => orientPoint(p, o));
  if (shape.type === "text") {
    const c = orientPoint({ x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }, o);
    return { ...shape, points, x: c.x - shape.width / 2, y: c.y - shape.height / 2 };
  }
  return { ...shape, points, ...orientRect(shape, o) };
}
