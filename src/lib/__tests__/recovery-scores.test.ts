import { describe, it, expect } from "vitest";
import {
  RECOVERY_METRICS,
  RECOVERY_METRIC_ORDER,
  SCORE_TONE_COLORS,
  clampScore,
  directionHint,
  scoreColor,
  scoreTone,
} from "@/lib/recovery-scores";

describe("RECOVERY_METRICS", () => {
  it("treats pain as lower-is-better and every other metric as higher-is-better", () => {
    expect(RECOVERY_METRICS.painLevel.direction).toBe("lower");
    for (const key of RECOVERY_METRIC_ORDER.filter((k) => k !== "painLevel")) {
      expect(RECOVERY_METRICS[key].direction).toBe("higher");
    }
  });

  it("lists every metric once in display order", () => {
    expect(new Set(RECOVERY_METRIC_ORDER).size).toBe(Object.keys(RECOVERY_METRICS).length);
  });
});

describe("scoreTone", () => {
  it("colours low pain green and high pain red", () => {
    expect(scoreTone(1, "lower")).toBe("good");
    expect(scoreTone(3, "lower")).toBe("good");
    expect(scoreTone(5, "lower")).toBe("fair");
    expect(scoreTone(7, "lower")).toBe("poor");
    expect(scoreTone(10, "lower")).toBe("poor");
  });

  it("colours high mobility green and low mobility red", () => {
    expect(scoreTone(9, "higher")).toBe("good");
    expect(scoreTone(7, "higher")).toBe("good");
    expect(scoreTone(4, "higher")).toBe("fair");
    expect(scoreTone(3, "higher")).toBe("poor");
    expect(scoreTone(0, "higher")).toBe("poor");
  });

  it("clamps out-of-range scores", () => {
    expect(scoreTone(-4, "lower")).toBe("good");
    expect(scoreTone(42, "higher")).toBe("good");
    expect(clampScore(Number.NaN)).toBe(0);
  });
});

describe("scoreColor / directionHint", () => {
  it("maps tones to the semantic palette", () => {
    expect(scoreColor(2, "lower")).toBe(SCORE_TONE_COLORS.good);
    expect(scoreColor(2, "higher")).toBe(SCORE_TONE_COLORS.poor);
  });

  it("labels the direction", () => {
    expect(directionHint("lower")).toBe("Lower is better");
    expect(directionHint("higher")).toBe("Higher is better");
  });
});
