import * as THREE from "three";
import type { MusclePart } from "./muscle-parts";

export function hashId(value: string): number {
  let n = 0;
  for (const ch of value) n = (n * 33 + ch.charCodeAt(0)) >>> 0;
  return n;
}

export function fiberTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (!g) return new THREE.CanvasTexture(canvas);
  g.fillStyle = "#f3f3f3";
  g.fillRect(0, 0, 64, 256);
  for (let y = 6; y < 256; y += 10) {
    g.fillStyle = "#9a9a9a";
    g.fillRect(0, y, 64, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function pointOn(points: THREE.Vector3[], t: number): THREE.Vector3 {
  const scaled = t * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(scaled));
  const u = scaled - i;
  return points[i].clone().lerp(points[i + 1], u);
}

function tangentOn(points: THREE.Vector3[], t: number): THREE.Vector3 {
  const a = pointOn(points, Math.max(0, t - 0.02));
  const b = pointOn(points, Math.min(1, t + 0.02));
  return b.sub(a).normalize();
}

function sampleArray(values: number[], t: number): number {
  const scaled = t * (values.length - 1);
  const i = Math.min(values.length - 2, Math.floor(scaled));
  const u = scaled - i;
  return values[i] + (values[i + 1] - values[i]) * u;
}

export function sheetGeometry(part: MusclePart): THREE.BufferGeometry {
  const points = part.path.map((p) => new THREE.Vector3(...p));
  const preferred = new THREE.Vector3(...part.out).normalize();
  const widths = part.width.map((value) => value * 1.45);
  const depths = part.depth.map((value) => value * 1.08);
  const samples = 22;
  const radial = 12;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let previous: THREE.Vector3 | null = null;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = pointOn(points, t);
    const tangent = tangentOn(points, t);
    let normal = new THREE.Vector3().crossVectors(tangent, preferred);
    if (normal.lengthSq() < 1e-8) {
      normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0));
    }
    normal.normalize();
    if (previous && normal.dot(previous) < 0) normal.negate();
    previous = normal.clone();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    const width = sampleArray(widths, t);
    const depth = sampleArray(depths, t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const vx = Math.cos(a) * width;
      const vy = Math.sin(a) * depth;
      positions.push(
        p.x + normal.x * vx + binormal.x * vy,
        p.y + normal.y * vx + binormal.y * vy,
        p.z + normal.z * vx + binormal.z * vy,
      );
      uvs.push(j / radial, t * 10);
    }
  }
  const stride = radial + 1;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function contextBody(fiber: THREE.Texture): THREE.Group {
  const filler = new THREE.Group();
  const bone = new THREE.MeshPhysicalMaterial({ color: "#efe6d6", roughness: 0.72 });
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 32, 24), bone);
  skull.scale.set(1, 1.18, 1.05);
  skull.position.set(0, 1.64, 0.01);
  skull.castShadow = true;
  filler.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 16), bone);
  jaw.scale.set(1.1, 0.7, 0.9);
  jaw.position.set(0, 1.55, 0.045);
  filler.add(jaw);

  const fillerMat = new THREE.MeshPhysicalMaterial({
    color: "#c48b86",
    roughness: 0.7,
    map: fiber,
  });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.12, 28, 20), fillerMat);
  torso.scale.set(1.05, 1.85, 0.4);
  torso.position.set(0, 1.18, 0.01);
  torso.castShadow = true;
  filler.add(torso);

  for (const sign of [1, -1]) {
    limb(filler, sign * 0.24, 1.16, 0, 0.03, 0.14, fillerMat);
    limb(filler, sign * 0.28, 0.92, 0.01, 0.022, 0.1, fillerMat);
    limb(filler, sign * 0.11, 0.7, 0.01, 0.04, 0.2, fillerMat);
    limb(filler, sign * 0.11, 0.28, -0.01, 0.028, 0.14, fillerMat);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), fillerMat);
    hand.position.set(sign * 0.31, 0.78, 0.02);
    filler.add(hand);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.16), bone);
    foot.position.set(sign * 0.11, 0.03, 0.03);
    filler.add(foot);
  }
  return filler;
}

function limb(
  filler: THREE.Group,
  x: number,
  y: number,
  z: number,
  radius: number,
  length: number,
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  filler.add(mesh);
}
