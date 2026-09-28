import { describe, expect, it } from "vitest";
import { ANATOMY_PARTS } from "./parts";
import {
  MUSCLE_GROUPS,
  groupMuscles,
  summarizeSelection,
  unitIdsOf,
  unitLabelOf,
} from "./muscle-groups";

const muscleId = (label: string) => {
  const part = ANATOMY_PARTS.muscles.find((p) => p.label === label);
  if (!part) throw new Error(`missing ${label}`);
  return part.id;
};

const labelsOf = (ids: string[]) =>
  ids.map((id) => ANATOMY_PARTS.muscles.find((p) => p.id === id)?.label).sort();

describe("clinical muscle groups", () => {
  it("assigns every muscle to a group in its own region", () => {
    const regionOf = new Map(MUSCLE_GROUPS.map((g) => [g.key, g.region]));
    const bad = ANATOMY_PARTS.muscles.filter((p) => !p.fg || regionOf.get(p.fg) !== p.group);
    expect(bad).toEqual([]);
  });

  it("groups the quadriceps on one side", () => {
    const unit = unitIdsOf("muscles", muscleId("Right vastus lateralis"));
    expect(labelsOf(unit)).toEqual(
      expect.arrayContaining([
        "Right vastus lateralis",
        "Right vastus medialis",
        "Right vastus intermedius",
      ]),
    );
    expect(labelsOf(unit).some((l) => l?.startsWith("Left"))).toBe(false);
    expect(labelsOf(unit).some((l) => /rectus femoris/.test(l ?? ""))).toBe(true);
  });

  it.each([
    ["Long head of right biceps femoris", "Hamstrings (right)"],
    ["Right supraspinatus", "Rotator cuff (right)"],
    ["Humeral head of right pronator teres", "Forearm flexors & pronators (right)"],
    ["Right extensor digitorum longus", "Shin (anterior compartment) (right)"],
    ["Right extensor digitorum", "Forearm extensors & supinator (right)"],
    ["Diaphragm", "Diaphragm"],
  ])("labels %s as %s", (label, unit) => {
    expect(unitLabelOf("muscles", muscleId(label))).toBe(unit);
  });

  it("keeps bones as single-part units", () => {
    const femur = ANATOMY_PARTS.skeleton.find((p) => p.label === "Right femur");
    expect(unitIdsOf("skeleton", femur!.id)).toEqual([femur!.id]);
  });
});

describe("summarizeSelection", () => {
  it("collapses a fully selected group into one item", () => {
    const unit = unitIdsOf("muscles", muscleId("Right gluteus medius"));
    const items = summarizeSelection("muscles", unit);
    expect(items).toEqual([expect.objectContaining({ label: "Gluteals (right)", isGroup: true })]);
  });

  it("lists individual muscles when a group is only partly selected", () => {
    const items = summarizeSelection("muscles", [muscleId("Right gluteus medius")]);
    expect(items).toEqual([expect.objectContaining({ label: "Right gluteus medius", isGroup: false })]);
  });
});

describe("groupMuscles", () => {
  it("nests clinical groups under regions", () => {
    const thigh = groupMuscles().find((r) => r.region.key === "thigh");
    expect(thigh?.groups.map((g) => g.group.key)).toEqual(["quadriceps", "hamstrings", "adductors", "sartorius"]);
  });

  it("finds muscles by clinical group name", () => {
    const result = groupMuscles("hamstrings");
    expect(result.map((r) => r.region.key)).toEqual(["thigh"]);
    expect(result[0].groups[0].parts.length).toBe(8);
  });
});
