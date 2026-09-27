import { describe, expect, it } from "vitest";
import { englishBoneName } from "@/lib/anatomy/bone-name";
import { englishPartName } from "@/lib/anatomy/muscle-name";
import { MUSCLE_COUNT, muscleParts } from "@/lib/anatomy/muscle-parts";

describe("anatomy catalog", () => {
  it("keeps the 50-muscle set, left and right", () => {
    expect(MUSCLE_COUNT).toBe(50);
    const parts = muscleParts();
    expect(parts).toHaveLength(50);
    expect(parts.find((part) => part.id === "trapezius-left")?.english).toBe(
      "Left Trapezius",
    );
  });

  it("names a mirrored bone in English", () => {
    expect(englishBoneName("Femur.r")).toBe("Right Femur");
    expect(englishBoneName("Femur.l")).toBe("Left Femur");
    expect(englishBoneName("Parietal bone left")).toBe("Parietal bone left");
    expect(englishBoneName("Distal phalanx of 2d finger.r")).toBe(
      "Right Distal phalanx of 2nd finger",
    );
    expect(englishBoneName("Atlas (C1)")).toBe("Atlas (C1)");
    expect(englishBoneName("Bones")).toBe("");
  });

  it("names an atlas muscle in English", () => {
    expect(englishPartName("Clavicular head of pectoralis major muscle.r")).toBe(
      "Right Clavicular head of pectoralis major",
    );
    expect(englishPartName("Latissimus dorsi muscle.l")).toBe("Left Latissimus dorsi");
    expect(englishPartName("Frontal bone")).toBe("Frontal bone");
  });
});
