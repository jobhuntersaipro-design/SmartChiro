/**
 * Recovery questionnaire metrics are scored 0–10, but they don't all point the
 * same way: a pain score of 2 is good news, a mobility score of 2 is not. Each
 * metric carries its direction so bars, pills and labels colour by meaning
 * rather than by raw number.
 */
export type ScoreDirection = "lower" | "higher";

export type RecoveryMetric =
  | "painLevel"
  | "mobilityScore"
  | "sleepQuality"
  | "dailyFunction"
  | "overallImprovement";

export const RECOVERY_METRICS: Record<RecoveryMetric, { label: string; direction: ScoreDirection }> = {
  painLevel: { label: "Pain", direction: "lower" },
  mobilityScore: { label: "Mobility", direction: "higher" },
  sleepQuality: { label: "Sleep", direction: "higher" },
  dailyFunction: { label: "Function", direction: "higher" },
  overallImprovement: { label: "Overall", direction: "higher" },
};

export const RECOVERY_METRIC_ORDER: RecoveryMetric[] = [
  "painLevel",
  "mobilityScore",
  "sleepQuality",
  "dailyFunction",
  "overallImprovement",
];

export type ScoreTone = "good" | "fair" | "poor";

export const SCORE_TONE_COLORS: Record<ScoreTone, string> = {
  good: "#30B130",
  fair: "#F5A623",
  poor: "#DF1B41",
};

/** Clamp to the 0–10 scale; non-finite input counts as 0. */
export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(10, score));
}

/**
 * Good / fair / poor for a 0–10 score in the given direction. "higher":
 * 7–10 good, 4–6 fair, 0–3 poor. "lower" mirrors it: 0–3 good, 4–6 fair,
 * 7–10 poor.
 */
export function scoreTone(score: number, direction: ScoreDirection): ScoreTone {
  const s = clampScore(score);
  const better = direction === "lower" ? 10 - s : s;
  if (better >= 7) return "good";
  if (better >= 4) return "fair";
  return "poor";
}

export function scoreColor(score: number, direction: ScoreDirection): string {
  return SCORE_TONE_COLORS[scoreTone(score, direction)];
}

export function directionHint(direction: ScoreDirection): string {
  return direction === "lower" ? "Lower is better" : "Higher is better";
}
