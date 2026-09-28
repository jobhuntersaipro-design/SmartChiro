import { describe, expect, it } from "vitest";
import {
  ANATOMY_GROUPS,
  ANATOMY_PARTS,
  compareParts,
  expansionFor,
  groupParts,
  isPeeledAway,
  matchesQuery,
  type AnatomyLayer,
  type AnatomyPart,
} from "./parts";

const LAYERS: AnatomyLayer[] = ["skeleton", "muscles"];

describe("anatomy manifest", () => {
  it.each(LAYERS)("every %s part belongs to a known group", (layer) => {
    const keys = new Set(ANATOMY_GROUPS[layer].map((g) => g.key));
    const unknown = ANATOMY_PARTS[layer].filter((p) => !keys.has(p.group));
    expect(unknown).toEqual([]);
  });

  it.each(LAYERS)("%s part ids are unique", (layer) => {
    const ids = ANATOMY_PARTS[layer].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has the full vertebral column C1–L5 and the lumbosacral disc", () => {
    const shorts = new Set(ANATOMY_PARTS.skeleton.map((p) => p.short));
    for (let n = 1; n <= 7; n++) expect(shorts).toContain(`C${n}`);
    for (let n = 1; n <= 12; n++) expect(shorts).toContain(`T${n}`);
    for (let n = 1; n <= 5; n++) expect(shorts).toContain(`L${n}`);
    expect(shorts).toContain("L5–S1");
  });
});

describe("compareParts", () => {
  const part = (label: string, extra: Partial<AnatomyPart> = {}): AnatomyPart => ({
    id: label,
    label,
    group: "x",
    side: "midline",
    ...extra,
  });

  it("orders spinal levels top to bottom with discs between vertebrae", () => {
    const parts = [
      part("L5", { short: "L5" }),
      part("C7–T1 disc", { short: "C7–T1" }),
      part("T12", { short: "T12" }),
      part("C7", { short: "C7" }),
      part("T1", { short: "T1" }),
      part("L5–S1 disc", { short: "L5–S1" }),
    ];
    expect(parts.sort(compareParts).map((p) => p.short)).toEqual(["C7", "C7–T1", "T1", "T12", "L5", "L5–S1"]);
  });

  it("keeps right/left pairs together, right first", () => {
    const parts = [
      part("Left femur", { side: "left" }),
      part("Right tibia", { side: "right" }),
      part("Right femur", { side: "right" }),
    ];
    expect(parts.sort(compareParts).map((p) => p.label)).toEqual(["Right femur", "Left femur", "Right tibia"]);
  });
});

describe("search", () => {
  it("matches every term against label and level code", () => {
    const l5: AnatomyPart = { id: "a", label: "Fifth lumbar vertebra (L5)", group: "lumbar", side: "midline", short: "L5" };
    expect(matchesQuery(l5, "l5")).toBe(true);
    expect(matchesQuery(l5, "lumbar fifth")).toBe(true);
    expect(matchesQuery(l5, "thoracic")).toBe(false);
    expect(matchesQuery(l5, "   ")).toBe(true);
  });

  it("drops groups with no matches", () => {
    const groups = groupParts("muscles", "gluteus");
    expect(groups.map((g) => g.group.key)).toEqual(["hip"]);
    expect(groups[0].parts.length).toBeGreaterThanOrEqual(6);
  });
});

describe("muscle depth layers", () => {
  const muscle = (label: string) => {
    const part = ANATOMY_PARTS.muscles.find((p) => p.label === label);
    if (!part) throw new Error(`missing ${label}`);
    return part;
  };

  it("gives every muscle a layer and an explode vector", () => {
    const missing = ANATOMY_PARTS.muscles.filter((p) => !p.layer || !p.explode);
    expect(missing).toEqual([]);
    expect(ANATOMY_PARTS.skeleton.some((p) => p.layer || p.explode)).toBe(false);
  });

  it("uses all three layers", () => {
    const layers = new Set(ANATOMY_PARTS.muscles.map((p) => p.layer));
    expect([...layers].sort()).toEqual([1, 2, 3]);
  });

  it.each([
    ["Right gluteus maximus", 1],
    ["Left latissimus dorsi", 1],
    ["Right rectus abdominis", 1],
    ["Right vastus intermedius", 2],
    ["Right longissimus thoracis", 2],
    ["Right multifidus", 3],
    ["Right psoas major", 3],
  ] as const)("classifies %s as layer %i", (label, layer) => {
    expect(muscle(label).layer).toBe(layer);
  });

  it("peels layers from the outside in", () => {
    const superficial = muscle("Right gluteus maximus");
    const deep = muscle("Right psoas major");
    expect(isPeeledAway(superficial, 1)).toBe(false);
    expect(isPeeledAway(superficial, 2)).toBe(true);
    expect(isPeeledAway(deep, 3)).toBe(false);
  });

  it("spreads superficial muscles further than deep ones in the same region", () => {
    const length = (p: { explode?: number[] }) => Math.hypot(...(p.explode ?? [0]));
    expect(length(muscle("Right vastus lateralis"))).toBeGreaterThan(length(muscle("Right vastus intermedius")));
  });

  it("expands everything when no group is picked, otherwise only picked groups", () => {
    const thigh = muscle("Right vastus lateralis");
    const neck = muscle("Right sternocleidomastoid");
    expect(expansionFor(neck, 0.5, new Set())).toBe(0.5);
    expect(expansionFor(thigh, 0.5, new Set(["thigh"]))).toBe(0.5);
    expect(expansionFor(neck, 0.5, new Set(["thigh"]))).toBe(0);
  });
});
