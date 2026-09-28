import manifest from "./manifest.json";
import {
  ANATOMY_GROUPS,
  ANATOMY_PARTS,
  compareParts,
  matchesQuery,
  type AnatomyGroup,
  type AnatomyLayer,
  type AnatomyPart,
} from "./parts";

export interface MuscleGroup {
  key: string;
  label: string;
  /** Body region (side-panel group) the clinical group sits in. */
  region: string;
}

export const MUSCLE_GROUPS: MuscleGroup[] = manifest.muscleGroups;

const GROUP_BY_KEY = new Map(MUSCLE_GROUPS.map((g) => [g.key, g]));

export function muscleGroupLabel(key: string): string {
  return GROUP_BY_KEY.get(key)?.label ?? key;
}

/**
 * A selection unit is what one click picks: a clinical muscle group on one
 * side (e.g. right quadriceps), or a single bone on the skeleton layer.
 */
export function unitKeyOf(layer: AnatomyLayer, part: AnatomyPart): string {
  return layer === "muscles" && part.fg ? `${part.fg}:${part.side}` : part.id;
}

function buildUnits(layer: AnatomyLayer) {
  const byKey = new Map<string, string[]>();
  const keyOfId = new Map<string, string>();
  for (const part of ANATOMY_PARTS[layer]) {
    const key = unitKeyOf(layer, part);
    keyOfId.set(part.id, key);
    byKey.set(key, [...(byKey.get(key) ?? []), part.id]);
  }
  return { byKey, keyOfId };
}

const UNITS: Record<AnatomyLayer, ReturnType<typeof buildUnits>> = {
  skeleton: buildUnits("skeleton"),
  muscles: buildUnits("muscles"),
};

const PART_BY_ID: Record<AnatomyLayer, Map<string, AnatomyPart>> = {
  skeleton: new Map(ANATOMY_PARTS.skeleton.map((p) => [p.id, p])),
  muscles: new Map(ANATOMY_PARTS.muscles.map((p) => [p.id, p])),
};

/** Every part id selected together with `id` (including `id`). */
export function unitIdsOf(layer: AnatomyLayer, id: string): string[] {
  const key = UNITS[layer].keyOfId.get(id);
  return key ? (UNITS[layer].byKey.get(key) ?? [id]) : [id];
}

export function unitKeyOfId(layer: AnatomyLayer, id: string): string {
  return UNITS[layer].keyOfId.get(id) ?? id;
}

/** "Quadriceps (right)" for a muscle unit; the part label for a bone. */
export function unitLabelOf(layer: AnatomyLayer, id: string): string {
  const part = PART_BY_ID[layer].get(id);
  if (!part) return id;
  if (layer !== "muscles" || !part.fg) return part.label;
  const label = muscleGroupLabel(part.fg);
  return part.side === "midline" ? label : `${label} (${part.side})`;
}

export interface SelectionItem {
  key: string;
  label: string;
  ids: string[];
  /** True when the item is a whole clinical group rather than one muscle. */
  isGroup: boolean;
}

/**
 * Collapses a list of selected ids into display items: a fully selected
 * multi-muscle group becomes one item, anything else stays per muscle.
 */
export function summarizeSelection(layer: AnatomyLayer, ids: string[]): SelectionItem[] {
  const selected = new Set(ids);
  const items: SelectionItem[] = [];
  const seenUnits = new Set<string>();
  for (const id of ids) {
    const part = PART_BY_ID[layer].get(id);
    if (!part) continue;
    const unit = unitIdsOf(layer, id);
    const unitKey = unitKeyOfId(layer, id);
    if (unit.length > 1 && unit.every((u) => selected.has(u))) {
      if (seenUnits.has(unitKey)) continue;
      seenUnits.add(unitKey);
      items.push({ key: unitKey, label: unitLabelOf(layer, id), ids: unit, isGroup: true });
    } else {
      items.push({ key: id, label: part.label, ids: [id], isGroup: false });
    }
  }
  return items;
}

export interface MuscleGroupEntry {
  group: MuscleGroup;
  parts: AnatomyPart[];
}

export interface RegionEntry {
  region: AnatomyGroup;
  groups: MuscleGroupEntry[];
}

/** Side-panel tree for the muscle layer: region → clinical group → muscles. */
export function groupMuscles(query = ""): RegionEntry[] {
  const parts = ANATOMY_PARTS.muscles.filter((p) => matchesQuery(p, query));
  return ANATOMY_GROUPS.muscles
    .map((region) => ({
      region,
      groups: MUSCLE_GROUPS.filter((g) => g.region === region.key)
        .map((group) => ({
          group,
          parts: parts.filter((p) => p.fg === group.key).sort(compareParts),
        }))
        .filter((g) => g.parts.length > 0),
    }))
    .filter((r) => r.groups.length > 0);
}
