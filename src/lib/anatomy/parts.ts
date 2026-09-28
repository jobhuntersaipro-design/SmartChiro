import manifest from "./manifest.json";

export type AnatomyLayer = "skeleton" | "muscles";
export type AnatomySide = "left" | "right" | "midline";

export interface AnatomyPart {
  id: string;
  label: string;
  group: string;
  side: AnatomySide;
  /** Spinal level code, e.g. "L5" or "L5–S1" — only on vertebrae and discs. */
  short?: string;
}

export interface AnatomyGroup {
  key: string;
  label: string;
}

export const ANATOMY_ATTRIBUTION = manifest.source;

export const MODEL_URLS: Record<AnatomyLayer, string> = {
  skeleton: "/models/anatomy/skeleton.glb",
  muscles: "/models/anatomy/muscles.glb",
};

export const ANATOMY_GROUPS: Record<AnatomyLayer, AnatomyGroup[]> = {
  skeleton: [
    { key: "skull", label: "Skull & jaw" },
    { key: "cervical", label: "Cervical spine" },
    { key: "thoracic", label: "Thoracic spine" },
    { key: "lumbar", label: "Lumbar spine" },
    { key: "discs", label: "Intervertebral discs" },
    { key: "pelvis", label: "Pelvis & sacrum" },
    { key: "ribcage", label: "Rib cage & sternum" },
    { key: "shoulder", label: "Shoulder girdle" },
    { key: "arm", label: "Arm & forearm" },
    { key: "hand", label: "Wrist & hand" },
    { key: "leg", label: "Thigh & leg" },
    { key: "foot", label: "Ankle & foot" },
  ],
  muscles: [
    { key: "head", label: "Head & face" },
    { key: "neck", label: "Neck" },
    { key: "back", label: "Back & spine" },
    { key: "chest", label: "Chest" },
    { key: "abdomen", label: "Abdomen & pelvic floor" },
    { key: "shoulder", label: "Shoulder & rotator cuff" },
    { key: "arm", label: "Upper arm" },
    { key: "forearm", label: "Forearm & hand" },
    { key: "hip", label: "Hip & gluteal" },
    { key: "thigh", label: "Thigh" },
    { key: "leg", label: "Leg & foot" },
  ],
};

export const ANATOMY_PARTS: Record<AnatomyLayer, AnatomyPart[]> = {
  skeleton: manifest.skeleton as AnatomyPart[],
  muscles: manifest.muscles as AnatomyPart[],
};

const SPINE_REGION_ORDER: Record<string, number> = { C: 0, T: 1, L: 2, S: 3 };

/** Sort key for a spinal level code: "C1" → 1, "T12" → 212, "L5–S1" → 305.5 */
function spineRank(short: string): number {
  const match = short.match(/^([CTLS])(\d+)(–)?/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const base = SPINE_REGION_ORDER[match[1]] * 100 + Number(match[2]);
  return match[3] ? base + 0.5 : base;
}

const SIDE_ORDER: Record<AnatomySide, number> = { midline: 0, right: 1, left: 2 };

/** Anatomical ordering: spine top-to-bottom, then label, then right before left. */
export function compareParts(a: AnatomyPart, b: AnatomyPart): number {
  if (a.short && b.short) return spineRank(a.short) - spineRank(b.short);
  if (a.short) return -1;
  if (b.short) return 1;
  const baseA = stripSide(a.label);
  const baseB = stripSide(b.label);
  return baseA.localeCompare(baseB) || SIDE_ORDER[a.side] - SIDE_ORDER[b.side];
}

function stripSide(label: string): string {
  return label.replace(/\b(right|left)\s+/i, "").toLowerCase();
}

export function matchesQuery(part: AnatomyPart, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${part.label} ${part.short ?? ""}`.toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

export interface GroupedParts {
  group: AnatomyGroup;
  parts: AnatomyPart[];
}

export function groupParts(layer: AnatomyLayer, query = ""): GroupedParts[] {
  const parts = ANATOMY_PARTS[layer].filter((p) => matchesQuery(p, query));
  return ANATOMY_GROUPS[layer]
    .map((group) => ({
      group,
      parts: parts.filter((p) => p.group === group.key).sort(compareParts),
    }))
    .filter((g) => g.parts.length > 0);
}

export function findPart(layer: AnatomyLayer, id: string): AnatomyPart | undefined {
  return ANATOMY_PARTS[layer].find((p) => p.id === id);
}

export function groupLabel(layer: AnatomyLayer, key: string): string {
  return ANATOMY_GROUPS[layer].find((g) => g.key === key)?.label ?? key;
}
