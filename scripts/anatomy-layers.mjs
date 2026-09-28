/**
 * Depth layers and exploded-view vectors for the muscle model.
 *
 * Layers come from a voxel "peel" simulation. Muscles and bones are
 * rasterised into a 3 mm grid; a muscle surface voxel is exposed when an
 * unobstructed straight line leads from it out of the model along any of 24
 * directions (straight up/down are skipped — the model has no organs, so
 * those would look through the empty body cavity). Muscles with enough
 * exposed surface form layer 1 (superficial). They are removed and the test
 * repeats for layer 2; whatever is still hidden is layer 3 (deep). Bones
 * always occlude and are never peeled.
 */

const VOXEL = 0.003; // metres
const PAD = 2; // voxels of empty border around the model
const EXPOSED_FRACTION = 0.2;
const LAYER_COUNT = 3;

function directions() {
  const out = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++) if (dx !== 0 || dz !== 0) out.push([dx, dy, dz]);
  return out;
}

function bounds(meshes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const tri of meshes) {
    for (let i = 0; i < tri.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (tri[i + k] < min[k]) min[k] = tri[i + k];
        if (tri[i + k] > max[k]) max[k] = tri[i + k];
      }
    }
  }
  return { min, max };
}

/** Marks every voxel a triangle passes through, sampling densely enough to leave no holes. */
function rasterise(tri, mark) {
  for (let t = 0; t < tri.length; t += 9) {
    const ax = tri[t], ay = tri[t + 1], az = tri[t + 2];
    const bx = tri[t + 3], by = tri[t + 4], bz = tri[t + 5];
    const cx = tri[t + 6], cy = tri[t + 7], cz = tri[t + 8];
    const edge = Math.max(
      Math.hypot(bx - ax, by - ay, bz - az),
      Math.hypot(cx - ax, cy - ay, cz - az),
      Math.hypot(cx - bx, cy - by, cz - bz),
    );
    const n = Math.max(1, Math.ceil(edge / (VOXEL * 0.5)));
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        mark(ax * w + bx * u + cx * v, ay * w + by * u + cy * v, az * w + bz * u + cz * v);
      }
    }
  }
}

/**
 * @param muscles  array of { tri: Float32Array } (non-indexed triangles, metres)
 * @param bones    array of Float32Array triangle soups that always occlude
 * @returns layer (1 = superficial … 3 = deep) per muscle
 */
export function computeMuscleLayers(muscles, bones = []) {
  const { min, max } = bounds([...muscles.map((m) => m.tri), ...bones]);
  const [nx, ny, nz] = [0, 1, 2].map((k) => Math.ceil((max[k] - min[k]) / VOXEL) + PAD * 2 + 1);
  const nxy = nx * ny;
  const size = nxy * nz;
  const index = (x, y, z) =>
    Math.floor((x - min[0]) / VOXEL + PAD) +
    Math.floor((y - min[1]) / VOXEL + PAD) * nx +
    Math.floor((z - min[2]) / VOXEL + PAD) * nxy;

  const BONE = -2;
  const label = new Int16Array(size).fill(-1);
  for (const tri of bones) rasterise(tri, (x, y, z) => (label[index(x, y, z)] = BONE));
  muscles.forEach(({ tri }, part) => rasterise(tri, (x, y, z) => (label[index(x, y, z)] = part)));

  const layer = new Array(muscles.length).fill(LAYER_COUNT);
  const removed = new Uint8Array(muscles.length);
  const occupied = new Uint8Array(size);
  const clear = new Uint8Array(size);
  const visible = new Uint8Array(size);

  for (let pass = 1; pass < LAYER_COUNT; pass++) {
    for (let i = 0; i < size; i++) {
      const l = label[i];
      occupied[i] = l === BONE || (l >= 0 && !removed[l]) ? 1 : 0;
    }
    visible.fill(0);

    for (const [dx, dy, dz] of directions()) {
      // clear[v]: v and every voxel beyond it along the direction are empty.
      // Sweep against the direction so the next voxel is always done first.
      const step = dx + dy * nx + dz * nxy;
      const xs = dx > 0 ? [nx - 1, -1, -1] : [0, nx, 1];
      const ys = dy > 0 ? [ny - 1, -1, -1] : [0, ny, 1];
      const zs = dz > 0 ? [nz - 1, -1, -1] : [0, nz, 1];
      for (let z = zs[0]; z !== zs[1]; z += zs[2]) {
        const zEdge = z + dz < 0 || z + dz >= nz;
        for (let y = ys[0]; y !== ys[1]; y += ys[2]) {
          const yEdge = zEdge || y + dy < 0 || y + dy >= ny;
          let i = xs[0] + y * nx + z * nxy;
          for (let x = xs[0]; x !== xs[1]; x += xs[2], i += xs[2]) {
            if (occupied[i]) clear[i] = 0;
            else clear[i] = yEdge || x + dx < 0 || x + dx >= nx ? 1 : clear[i + step];
          }
        }
      }
      for (let i = 0; i < size; i++) {
        if (!visible[i] && label[i] >= 0 && occupied[i] && clear[i + step]) visible[i] = 1;
      }
    }

    const total = new Float64Array(muscles.length);
    const exposed = new Float64Array(muscles.length);
    for (let i = 0; i < size; i++) {
      const part = label[i];
      if (part < 0 || removed[part]) continue;
      total[part]++;
      if (visible[i]) exposed[part]++;
    }

    const peeled = [];
    for (let p = 0; p < muscles.length; p++) {
      if (!removed[p] && total[p] > 0 && exposed[p] / total[p] >= EXPOSED_FRACTION) {
        layer[p] = pass;
        peeled.push(p);
      }
    }
    for (const p of peeled) removed[p] = 1;
  }
  return layer;
}

const TRUNK_REGIONS = new Set(["head", "neck", "back", "chest", "abdomen"]);
// Hand and foot groups lie across the limb axis, so they spread around their own centroid.
const DISTAL_GROUPS = new Set(["thenar", "hypothenar", "hand-intrinsics", "foot-intrinsics"]);

// Full-expansion tuning (metres). Groups first move apart from each other,
// then the muscles inside each group spread around the group's centre.
const GROUP_SCALE = 1.2;
const GROUP_GAP = 0.08;
const PART_SCALE = 1.5;
const PART_GAP = 0.02;
const LAYER_LIFT = 0.04;
// Limb muscles moving toward the midline would collide with the other limb
// (e.g. left and right adductors), so their inward component is damped.
const MEDIAL_DAMPING = 0.2;

function centroid(tri) {
  const c = [0, 0, 0];
  for (let i = 0; i < tri.length; i += 3) {
    c[0] += tri[i];
    c[1] += tri[i + 1];
    c[2] += tri[i + 2];
  }
  const n = tri.length / 3;
  return c.map((v) => v / n);
}

function meanOf(points) {
  const sum = [0, 0, 0];
  for (const p of points) for (let k = 0; k < 3; k++) sum[k] += p[k];
  return sum.map((v) => v / points.length);
}

function unitVector(from, to, horizontal) {
  const d = [to[0] - from[0], horizontal ? 0 : to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(...d);
  return length < 1e-4 ? { dir: [0, 0, 0], length: 0 } : { dir: d.map((v) => v / length), length };
}

/**
 * Per-muscle exploded-view offset (metres at full expansion), in two levels:
 *
 * 1. Each clinical group (per side) moves away from its anchor — the body's
 *    vertical axis for trunk regions, the limb's axis for limbs, or the
 *    hand/foot centroid — so e.g. quadriceps, hamstrings and adductors part.
 * 2. Muscles within a group spread around the group's own centre.
 *
 * Superficial muscles get an extra lift along the group direction so outer
 * layers clear the deep ones.
 *
 * @param parts  array of { tri, group (region), side, fg (clinical group key) }
 */
export function computeExplodeVectors(parts, layers) {
  const centers = parts.map(({ tri }) => centroid(tri));
  const anchorKey = (p) => {
    if (TRUNK_REGIONS.has(p.group)) return "trunk";
    return `${p.group}:${p.side}:${DISTAL_GROUPS.has(p.fg) ? "distal" : "proximal"}`;
  };
  const unitKey = (p) => `${p.fg}:${p.side}`;

  const collect = (keyOf) => {
    const map = new Map();
    parts.forEach((p, i) => {
      const key = keyOf(p);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(centers[i]);
    });
    return new Map([...map].map(([key, points]) => [key, meanOf(points)]));
  };
  const anchors = collect(anchorKey);
  const units = collect(unitKey);

  return parts.map((p, i) => {
    const horizontal = !DISTAL_GROUPS.has(p.fg);
    const anchorPoint = anchors.get(anchorKey(p));
    const anchor = anchorKey(p) === "trunk" ? [0, 0, anchorPoint[2]] : anchorPoint;
    const unitCenter = units.get(unitKey(p));

    const group = unitVector(anchor, unitCenter, horizontal);
    const part = unitVector(unitCenter, centers[i], horizontal);
    const groupMagnitude =
      group.length > 0 ? GROUP_SCALE * group.length + GROUP_GAP + LAYER_LIFT * (LAYER_COUNT - layers[i]) : 0;
    const partMagnitude = part.length > 0 ? PART_SCALE * part.length + PART_GAP : 0;

    const offset = [0, 1, 2].map((k) => group.dir[k] * groupMagnitude + part.dir[k] * partMagnitude);
    const medialSign = p.side === "right" ? 1 : p.side === "left" ? -1 : 0;
    if (anchorKey(p) !== "trunk" && offset[0] * medialSign > 0) offset[0] *= MEDIAL_DAMPING;
    return offset.map((v) => Math.round(v * 1e4) / 1e4);
  });
}
