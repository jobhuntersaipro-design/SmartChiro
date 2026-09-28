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

const TRUNK_GROUPS = new Set(["head", "neck", "back", "chest", "abdomen"]);

/**
 * Per-muscle exploded-view offset (metres at full expansion). Limb muscles
 * spread away from their own limb's long axis, trunk muscles away from the
 * body's vertical axis. Offsets grow with distance from the axis and with how
 * superficial the muscle is, so outer layers lift clear of the deep ones.
 */
export function computeExplodeVectors(parts, layers) {
  const centers = parts.map(({ tri }) => {
    const c = [0, 0, 0];
    for (let i = 0; i < tri.length; i += 3) {
      c[0] += tri[i];
      c[1] += tri[i + 1];
      c[2] += tri[i + 2];
    }
    const n = tri.length / 3;
    return c.map((v) => v / n);
  });

  const clusterOf = (p, i) => {
    if (TRUNK_GROUPS.has(p.group)) return "trunk";
    // Foot and hand muscles lie across the limb axis — give them their own.
    const extremity =
      (p.group === "leg" && centers[i][1] < 0.09) || (p.group === "forearm" && centers[i][1] < 0.8);
    return `${p.group}:${p.side}:${extremity ? "distal" : "proximal"}`;
  };

  const clusters = new Map();
  parts.forEach((p, i) => {
    const key = clusterOf(p, i);
    if (!clusters.has(key)) clusters.set(key, { sum: [0, 0, 0], n: 0 });
    const c = clusters.get(key);
    for (let k = 0; k < 3; k++) c.sum[k] += centers[i][k];
    c.n++;
  });

  return parts.map((p, i) => {
    const key = clusterOf(p, i);
    const { sum, n } = clusters.get(key);
    const axis = key === "trunk" ? [0, 0, sum[2] / n] : sum.map((v) => v / n);
    const distal = key.endsWith(":distal");
    // Horizontal spread around a vertical axis; distal clusters (hands, feet)
    // spread in all directions around their centroid instead.
    const dir = [centers[i][0] - axis[0], distal ? centers[i][1] - axis[1] : 0, centers[i][2] - axis[2]];
    const r = Math.hypot(...dir);
    if (r < 1e-4) return [0, 0, 0];
    const magnitude = 0.6 * r + 0.035 * (LAYER_COUNT - layers[i]);
    return dir.map((v) => Math.round((v / r) * magnitude * 1e4) / 1e4);
  });
}
