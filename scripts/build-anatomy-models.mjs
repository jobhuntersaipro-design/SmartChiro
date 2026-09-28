#!/usr/bin/env node
/**
 * Builds the web-ready 3D anatomy models used by /dashboard/anatomy.
 *
 * Source: BodyParts3D v3.0 (CC BY-SA 2.1 JP), STL mirror at
 *   https://github.com/Kevin-Mattheus-Moerman/BodyParts3D
 *
 * Usage:
 *   git clone --depth 1 https://github.com/Kevin-Mattheus-Moerman/BodyParts3D /tmp/bp3d
 *   node scripts/build-anatomy-models.mjs /tmp/bp3d
 *
 * Outputs:
 *   public/models/anatomy/skeleton.glb   — one named mesh per bone / disc
 *   public/models/anatomy/muscles.glb    — one named mesh per muscle part
 *   src/lib/anatomy/manifest.json        — part metadata (id, label, group, side;
 *                                          muscles also get depth layer + explode vector)
 *
 * Pipeline per part: parse binary STL → weld exact duplicate vertices →
 * meshoptimizer simplify to a triangle budget → smooth normals. Parts are then
 * re-oriented from BodyParts3D space (mm, Z-up, -Y anterior) to three.js space
 * (m, Y-up, +Z anterior), centered on X/Z with the soles at Y=0, and written as
 * a meshopt-compressed GLB.
 */
import fs from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import { computeExplodeVectors, computeMuscleLayers } from "./anatomy-layers.mjs";

const SRC = process.argv[2];
if (!SRC) {
  console.error("usage: node scripts/build-anatomy-models.mjs <path-to-BodyParts3D-checkout>");
  process.exit(1);
}
const DATA = path.join(SRC, "assets/BodyParts3D_data");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT_MODELS = path.join(ROOT, "public/models/anatomy");
const OUT_MANIFEST = path.join(ROOT, "src/lib/anatomy/manifest.json");

// Total triangle budget per model after simplification.
const BUDGET = { skeleton: 700_000, muscles: 5_000_000 };
const MIN_TRIS_PER_PART = 1_200;
// Position quantization bits (scene-wide grid over ~1.65 m): 14 → 0.1 mm, 16 → 0.025 mm.
const POSITION_BITS = { skeleton: 14, muscles: 16 };

// Where BodyParts3D geometry misleads the voxel peel: the rectus sheath is
// modelled as part of the external oblique (so rectus looks covered), and the
// deep calf flexors surface only as tendons at the ankle.
const LAYER_OVERRIDES = [
  [/rectus abdominis/, 1],
  [/flexor (digitorum|hallucis) longus/, 2],
];

// ─── Metadata ────────────────────────────────────────────────────────────────

function readTsv(file) {
  return fs
    .readFileSync(path.join(DATA, file), "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => l.split("\t"));
}

const names = new Map(readTsv("parts_list_e.txt").map(([id, name]) => [id, name]));
const parents = new Map();
for (const file of ["conventional_part_of.txt", "composite_parts.txt"]) {
  for (const [pid, pname, cid, cname] of readTsv(file)) {
    if (!cid) continue;
    names.set(pid, pname);
    names.set(cid, cname);
    if (!parents.has(cid)) parents.set(cid, new Set());
    parents.get(cid).add(pid);
  }
}

function ancestors(id) {
  const seen = new Set();
  const stack = [id];
  while (stack.length) {
    for (const p of parents.get(stack.pop()) ?? []) {
      if (!seen.has(p)) {
        seen.add(p);
        stack.push(p);
      }
    }
  }
  return new Set([...seen].map((a) => names.get(a) ?? a));
}

const BONE_RULES = [
  ["discs", /intervertebral disk/],
  ["cervical", /cervical vertebra|^atlas$|^axis$/],
  ["thoracic", /thoracic vertebra/],
  ["lumbar", /lumbar vertebra/],
  ["pelvis", /sacrum|hip bone/],
  ["ribcage", /\brib\b|costal cartilage|sternum|manubrium|xiphoid/],
  ["shoulder", /clavicle|scapula/],
  ["arm", /humerus|radius|ulna/],
  ["hand", /metacarpal|capitate|hamate|lunate|pisiform|scaphoid|trapezium|trapezoid|triquetral|finger|thumb/],
  ["leg", /femur|patella|tibia|fibula/],
  ["foot", /toe|metatarsal|calcaneus|talus|cuboid|cuneiform|navicular|sesamoid/],
  [
    "skull",
    /tooth|frontal bone|parietal bone|occipital bone|temporal bone|sphenoid|ethmoid|vomer|maxilla|mandible|zygomatic|nasal bone|lacrimal|palatine|nasal concha|hyoid/,
  ],
];

// Order matters: specific name rules first, then region ancestors as fallback.
const MUSCLE_RULES = [
  ["head", (n, a) => a.has("musculature of head")],
  ["neck", (n, a) => a.has("musculature of neck") || /longus colli|scalen|sternocleidomastoid|platysma/.test(n)],
  ["shoulder", (n) => /deltoid|supraspinatus|infraspinatus|subscapularis|teres/.test(n)],
  ["arm", (n) => /biceps brachii|triceps brachii|\bbrachialis|coracobrachialis|anconeus/.test(n)],
  ["back", (n, a) => a.has("musculature of back")],
  ["chest", (n, a) => a.has("musculature of thorax")],
  [
    "hip",
    (n) => /glute|iliacus|psoas|piriformis|obturator|gemellus|quadratus femoris|tensor fasciae latae|iliotibial/.test(n),
  ],
  ["thigh", (n, a) => a.has("thigh")],
  ["abdomen", (n, a) => a.has("musculature of abdomen") || a.has("abdomen")],
  ["forearm", (n, a) => a.has("muscle of upper limb")],
  ["leg", (n, a) => a.has("muscle of lower limb")],
];

const ORDINALS = [
  "first", "second", "third", "fourth", "fifth", "sixth",
  "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth",
];
const REGION_LETTER = { cervical: "C", thoracic: "T", lumbar: "L" };
const REGION_COUNT = { cervical: 7, thoracic: 12, lumbar: 5 };
const NEXT_REGION = { cervical: "T1", thoracic: "L1", lumbar: "S1" };

function vertebraLevel(name) {
  if (/\batlas\b/.test(name)) return { region: "cervical", n: 1 };
  if (/\baxis\b/.test(name)) return { region: "cervical", n: 2 };
  const m = name.match(/(\w+) (cervical|thoracic|lumbar) vertebra/);
  if (!m) return null;
  return { region: m[2], n: ORDINALS.indexOf(m[1]) + 1 };
}

function levelCode({ region, n }) {
  return `${REGION_LETTER[region]}${n}`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function describe(name, kind) {
  const side = /\bright\b/.test(name) ? "right" : /\bleft\b/.test(name) ? "left" : "midline";
  let label = capitalize(name.replace(/, nsn$/, ""));
  let short;
  const level = vertebraLevel(name);
  if (kind === "skeleton" && level) {
    const code = levelCode(level);
    const next =
      level.n === REGION_COUNT[level.region]
        ? NEXT_REGION[level.region]
        : `${REGION_LETTER[level.region]}${level.n + 1}`;
    if (/intervertebral disk/.test(name)) {
      short = `${code}–${next}`;
      label = `${short} intervertebral disc`;
    } else {
      short = code;
      label = `${capitalize(name)} (${code})`;
    }
  }
  return { label, short, side };
}

function classify(id, name) {
  const a = ancestors(id);
  if (a.has("muscular system")) {
    const rule = MUSCLE_RULES.find(([, test]) => test(name, a));
    return rule ? { kind: "muscles", group: rule[0] } : null;
  }
  const rule = BONE_RULES.find(([, re]) => re.test(name));
  return rule ? { kind: "skeleton", group: rule[0] } : null;
}

// ─── Geometry ────────────────────────────────────────────────────────────────

function readStl(file) {
  const buf = fs.readFileSync(file);
  const count = buf.readUInt32LE(80);
  const tri = new Float32Array(count * 9);
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12;
    for (let v = 0; v < 3; v++) {
      const x = buf.readFloatLE(base + v * 12);
      const y = buf.readFloatLE(base + v * 12 + 4);
      const z = buf.readFloatLE(base + v * 12 + 8);
      // BodyParts3D (mm, Z-up, -Y anterior) → three.js (m, Y-up, +Z anterior)
      tri[i * 9 + v * 3] = x / 1000;
      tri[i * 9 + v * 3 + 1] = z / 1000;
      tri[i * 9 + v * 3 + 2] = -y / 1000;
    }
  }
  return tri;
}

function weld(tri) {
  const map = new Map();
  const positions = [];
  const indices = new Uint32Array(tri.length / 3);
  for (let i = 0; i < indices.length; i++) {
    const x = tri[i * 3], y = tri[i * 3 + 1], z = tri[i * 3 + 2];
    const key = `${x},${y},${z}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = positions.length / 3;
      map.set(key, idx);
      positions.push(x, y, z);
    }
    indices[i] = idx;
  }
  return { positions: new Float32Array(positions), indices };
}

function compact(positions, indices) {
  const remap = new Int32Array(positions.length / 3).fill(-1);
  const out = [];
  const idx = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    let r = remap[indices[i]];
    if (r === -1) {
      r = remap[indices[i]] = out.length / 3;
      const s = indices[i] * 3;
      out.push(positions[s], positions[s + 1], positions[s + 2]);
    }
    idx[i] = r;
  }
  return { positions: new Float32Array(out), indices: idx };
}

function smoothNormals(positions, indices) {
  const n = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3];
    const e1 = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const e2 = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const fx = e1[1] * e2[2] - e1[2] * e2[1];
    const fy = e1[2] * e2[0] - e1[0] * e2[2];
    const fz = e1[0] * e2[1] - e1[1] * e2[0];
    for (const v of [a, b, c]) {
      n[v] += fx;
      n[v + 1] += fy;
      n[v + 2] += fz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const len = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= len;
    n[i + 1] /= len;
    n[i + 2] /= len;
  }
  return n;
}

function simplify(tri, targetTris) {
  const welded = weld(tri);
  const sourceTris = welded.indices.length / 3;
  if (sourceTris <= targetTris) return welded;
  const [indices] = MeshoptSimplifier.simplify(
    welded.indices,
    welded.positions,
    3,
    targetTris * 3,
    0.01,
    [],
  );
  return compact(welded.positions, indices);
}

function mergeTriangles(list) {
  const total = list.reduce((s, t) => s + t.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const t of list) {
    out.set(t, o);
    o += t.length;
  }
  return out;
}

// ─── Build ───────────────────────────────────────────────────────────────────

async function main() {
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;

  const stlDir = path.join(DATA, "stl");
  const parts = { skeleton: [], muscles: [] };
  const teeth = [];
  const skipped = [];

  for (const file of fs.readdirSync(stlDir).sort()) {
    const id = file.replace(/\.stl$/, "");
    const name = names.get(id);
    if (!name) continue;
    const cls = classify(id, name);
    if (!cls) {
      if (ancestors(id).has("skeletal system") || ancestors(id).has("muscular system")) skipped.push(name);
      continue;
    }
    const tri = readStl(path.join(stlDir, file));
    if (/tooth/.test(name)) {
      teeth.push(tri);
      continue;
    }
    parts[cls.kind].push({ id, name, group: cls.group, tri, ...describe(name, cls.kind) });
  }
  if (teeth.length) {
    parts.skeleton.push({
      id: "teeth",
      name: "teeth",
      group: "skull",
      tri: mergeTriangles(teeth),
      label: "Teeth",
      side: "midline",
    });
  }

  // Shared transform: center on X/Z, soles at Y=0 — computed over everything.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of [...parts.skeleton, ...parts.muscles]) {
    for (let i = 0; i < p.tri.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (p.tri[i + k] < min[k]) min[k] = p.tri[i + k];
        if (p.tri[i + k] > max[k]) max[k] = p.tri[i + k];
      }
    }
  }
  const offset = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];
  for (const p of [...parts.skeleton, ...parts.muscles]) {
    for (let i = 0; i < p.tri.length; i += 3) {
      p.tri[i] += offset[0];
      p.tri[i + 1] += offset[1];
      p.tri[i + 2] += offset[2];
    }
  }

  console.log("computing muscle depth layers…");
  const layers = computeMuscleLayers(
    parts.muscles,
    parts.skeleton.map((p) => p.tri),
  ).map((layer, i) => LAYER_OVERRIDES.find(([re]) => re.test(parts.muscles[i].name))?.[1] ?? layer);
  const explode = computeExplodeVectors(parts.muscles, layers);
  parts.muscles.forEach((p, i) => {
    p.layer = layers[i];
    p.explode = explode[i];
  });

  fs.mkdirSync(OUT_MODELS, { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MANIFEST), { recursive: true });
  const manifest = {
    source: "BodyParts3D, © The Database Center for Life Science, licensed under CC BY-SA 2.1 JP",
    height: max[1] - min[1],
    skeleton: [],
    muscles: [],
  };

  for (const kind of ["skeleton", "muscles"]) {
    const list = parts[kind];
    const totalTris = list.reduce((s, p) => s + p.tri.length / 9, 0);
    const ratio = BUDGET[kind] / totalTris;

    const doc = new Document();
    const buffer = doc.createBuffer();
    const scene = doc.createScene(kind);
    let outTris = 0;

    for (const p of list) {
      const srcTris = p.tri.length / 9;
      const target = Math.max(MIN_TRIS_PER_PART, Math.round(srcTris * ratio));
      const { positions, indices } = simplify(p.tri, target);
      outTris += indices.length / 3;

      const prim = doc
        .createPrimitive()
        .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer))
        .setAttribute(
          "NORMAL",
          doc.createAccessor().setType("VEC3").setArray(smoothNormals(positions, indices)).setBuffer(buffer),
        )
        .setIndices(doc.createAccessor().setType("SCALAR").setArray(indices).setBuffer(buffer));
      const mesh = doc.createMesh(p.id).addPrimitive(prim);
      scene.addChild(doc.createNode(p.id).setMesh(mesh));

      const entry = { id: p.id, label: p.label, group: p.group, side: p.side };
      if (p.short) entry.short = p.short;
      if (p.layer) entry.layer = p.layer;
      if (p.explode) entry.explode = p.explode;
      manifest[kind].push(entry);
    }

    doc.createExtension(EXTMeshoptCompression).setRequired(true);
    doc.createExtension(KHRMeshQuantization).setRequired(true);
    await doc.transform(
      meshopt({
        encoder: MeshoptEncoder,
        level: "high",
        quantizationVolume: "scene",
        quantizePosition: POSITION_BITS[kind],
      }),
    );
    const out = path.join(OUT_MODELS, `${kind}.glb`);
    await new NodeIO()
      .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
      .registerDependencies({ "meshopt.encoder": MeshoptEncoder })
      .write(out, doc);
    const size = (fs.statSync(out).size / 1e6).toFixed(2);
    console.log(`${kind}: ${list.length} parts, ${Math.round(totalTris)} → ${outTris} tris, ${size} MB`);
  }

  for (const kind of ["skeleton", "muscles"]) {
    manifest[kind].sort((a, b) => a.label.localeCompare(b.label));
  }
  fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
  if (skipped.length) console.log(`skipped (not bone/muscle): ${skipped.join("; ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
