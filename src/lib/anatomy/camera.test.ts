import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { focusView } from "./camera";

const HOME = new THREE.Vector3(0, 0.95, 3.7);
const TARGET = new THREE.Vector3(0, 0.85, 0);

function boxAt(x: number, y: number, z: number, half = 0.05) {
  return new THREE.Box3(new THREE.Vector3(x - half, y - half, z - half), new THREE.Vector3(x + half, y + half, z + half));
}

describe("focusView", () => {
  it("targets the center of the box", () => {
    const [, , , tx, ty, tz] = focusView(boxAt(0.1, 1, 0.08), HOME, TARGET);
    expect([tx, ty, tz]).toEqual([0.1, 1, 0.08].map((v) => expect.closeTo(v, 6)));
  });

  it("views a posterior part from behind", () => {
    const [, , z] = focusView(boxAt(-0.08, 0.95, -0.09), HOME, TARGET);
    expect(z).toBeLessThan(-0.09);
  });

  it("views a lateral part from its own side", () => {
    const [x] = focusView(boxAt(-0.18, 1.3, 0), HOME, TARGET);
    expect(x).toBeLessThan(-0.18);
  });

  it("keeps the current viewing direction for parts on the body axis", () => {
    const [x, , z] = focusView(boxAt(0, 1, 0.01), HOME, TARGET);
    expect(Math.abs(x)).toBeLessThan(1e-6);
    expect(z).toBeGreaterThan(0.01);
  });

  it("backs off further for larger structures", () => {
    const small = focusView(boxAt(0, 1, 0.2, 0.02), HOME, TARGET);
    const large = focusView(boxAt(0, 1, 0.2, 0.3), HOME, TARGET);
    expect(large[2] - 0.2).toBeGreaterThan(small[2] - 0.2);
  });

  it("uses a preferred direction when one is given", () => {
    const [x, , z] = focusView(boxAt(-0.1, 0.5, 0.02), HOME, TARGET, [0, 0, 1]);
    expect(Math.abs(x + 0.1)).toBeLessThan(1e-6);
    expect(z).toBeGreaterThan(0.02);
  });
});
