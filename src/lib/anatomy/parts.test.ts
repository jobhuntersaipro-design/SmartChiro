import { describe, expect, it } from "vitest";
import {
  ANATOMY_GROUPS,
  ANATOMY_PARTS,
  compareParts,
  groupParts,
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
