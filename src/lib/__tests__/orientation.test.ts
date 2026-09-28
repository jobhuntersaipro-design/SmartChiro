import { describe, it, expect } from "vitest";
import {
  orientPoint,
  unorientPoint,
  orientRect,
  orientShape,
  orientationCss,
  type Orientation,
  type Rotation,
} from "@/lib/orientation";
import type { BaseShape } from "@/types/annotation";

const W = 400;
const H = 200;
const o = (rotation: Rotation, flipH = false, flipV = false): Orientation => ({ rotation, flipH, flipV, width: W, height: H });

/** What the browser does for `transform: rotate(r) scale(sx, sy)` about the centre. */
function cssMatrix(or: Orientation, p: { x: number; y: number }) {
  const rad = (or.rotation * Math.PI) / 180;
  const sx = or.flipH ? -1 : 1;
  const sy = or.flipV ? -1 : 1;
  const dx = (p.x - W / 2) * sx;
  const dy = (p.y - H / 2) * sy;
  return { x: W / 2 + Math.cos(rad) * dx - Math.sin(rad) * dy, y: H / 2 + Math.sin(rad) * dx + Math.cos(rad) * dy };
}

const ALL: Orientation[] = [0, 90, 180, 270].flatMap((r) =>
  [false, true].flatMap((fh) => [false, true].map((fv) => o(r as Rotation, fh, fv))),
);

describe("orientation", () => {
  it("matches the CSS transform applied to the image, for every combination", () => {
    const p = { x: 30, y: 170 };
    for (const or of ALL) {
      const got = orientPoint(p, or);
      const want = cssMatrix(or, p);
      expect(got.x).toBeCloseTo(want.x, 9);
      expect(got.y).toBeCloseTo(want.y, 9);
    }
  });

  it("unorientPoint inverts orientPoint", () => {
    const p = { x: 123.5, y: 17 };
    for (const or of ALL) {
      const back = unorientPoint(orientPoint(p, or), or);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it("flip H mirrors about the vertical centre line", () => {
    expect(orientPoint({ x: 10, y: 50 }, o(0, true))).toEqual({ x: 390, y: 50 });
  });

  it("rotating 90° swaps a box's width and height", () => {
    const r = orientRect({ x: 0, y: 0, width: 40, height: 10 }, o(90));
    expect(r.width).toBeCloseTo(10);
    expect(r.height).toBeCloseTo(40);
  });

  it("builds the same CSS string the viewer uses", () => {
    expect(orientationCss(o(0))).toBeUndefined();
    expect(orientationCss(o(90, true))).toBe("rotate(90deg) scale(-1, 1)");
  });

  it("moves shape geometry but keeps text boxes upright and the same size", () => {
    const base = { x: 0, y: 0, width: 60, height: 20, points: [{ x: 0, y: 0 }] } as unknown as BaseShape;
    const text = orientShape({ ...base, type: "text" } as BaseShape, o(90));
    expect(text.width).toBe(60);
    expect(text.height).toBe(20);
    const centre = orientPoint({ x: 30, y: 10 }, o(90));
    expect(text.x + text.width / 2).toBeCloseTo(centre.x);
    const line = orientShape({ ...base, type: "line", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] } as BaseShape, o(0, true));
    expect(line.points).toEqual([{ x: 400, y: 0 }, { x: 360, y: 0 }]);
    expect(orientShape(line, o(0))).toBe(line);
  });
});
