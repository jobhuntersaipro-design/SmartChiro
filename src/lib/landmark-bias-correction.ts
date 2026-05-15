/**
 * Bias correction for AI landmark detection.
 *
 * After Claude returns landmark coordinates we look up every prior user
 * correction for the same landmark name, compute the median *normalized*
 * delta (a fraction of imageWidth / imageHeight, so it transfers across
 * different X-ray resolutions), and add that delta to Claude's output. The
 * net effect is "Claude's raw guess + the systematic offset chiropractors
 * have been applying to fix this landmark on similar X-rays."
 *
 * Median (not mean) so a single wild correction (e.g. a misclick) doesn't
 * yank the bias. Normalized (not raw pixels) so corrections gathered on a
 * 1024×768 study still help on a 3024×1964 study.
 *
 * Conservative thresholds:
 *   - At least MIN_SAMPLES corrections per landmark before we touch its
 *     coordinates — fewer than that and we pass through Claude's output.
 *   - Final coords are clamped to image bounds.
 *
 * Future work (out of scope here):
 *   - Stratify corrections by user, branch, or body region.
 *   - Weight recent corrections heavier than old ones.
 *   - Train a small CNN once we have ≥1000 samples per landmark.
 */

import type { Landmark } from "./anthropic-vision";

export interface CorrectionRow {
  landmarkName: string;
  aiX: number;
  aiY: number;
  finalX: number;
  finalY: number;
  imageWidth: number;
  imageHeight: number;
}

export interface BiasEntry {
  /** Normalized x-delta: (finalX − aiX) / imageWidth, median across samples. */
  dxFrac: number;
  /** Normalized y-delta: (finalY − aiY) / imageHeight, median across samples. */
  dyFrac: number;
  /** Number of correction rows that fed into this entry. */
  n: number;
}

export const DEFAULT_MIN_SAMPLES = 3;

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Group corrections by landmark name and compute the median normalized
 * delta per group. Returns only groups that meet the minimum-sample
 * threshold — sparse landmarks are excluded.
 */
export function computeBiasMap(
  corrections: readonly CorrectionRow[],
  minSamples: number = DEFAULT_MIN_SAMPLES,
): Map<string, BiasEntry> {
  const buckets = new Map<string, { dxFracs: number[]; dyFracs: number[] }>();
  for (const c of corrections) {
    if (!Number.isFinite(c.imageWidth) || !Number.isFinite(c.imageHeight)) continue;
    if (c.imageWidth <= 0 || c.imageHeight <= 0) continue;
    const dxFrac = (c.finalX - c.aiX) / c.imageWidth;
    const dyFrac = (c.finalY - c.aiY) / c.imageHeight;
    if (!Number.isFinite(dxFrac) || !Number.isFinite(dyFrac)) continue;
    const b = buckets.get(c.landmarkName) ?? { dxFracs: [], dyFracs: [] };
    b.dxFracs.push(dxFrac);
    b.dyFracs.push(dyFrac);
    buckets.set(c.landmarkName, b);
  }

  const out = new Map<string, BiasEntry>();
  for (const [name, b] of buckets) {
    if (b.dxFracs.length < minSamples) continue;
    const xs = [...b.dxFracs].sort((a, c) => a - c);
    const ys = [...b.dyFracs].sort((a, c) => a - c);
    out.set(name, {
      dxFrac: median(xs),
      dyFrac: median(ys),
      n: b.dxFracs.length,
    });
  }
  return out;
}

/**
 * Apply bias correction to a fresh batch of Claude-returned landmarks.
 * For each landmark, if we have enough prior corrections, add the median
 * normalized delta scaled to the current image's dimensions. Otherwise
 * return the landmark unchanged.
 *
 * Output coordinates are clamped to [0, imageWidth] × [0, imageHeight].
 */
export function applyBiasCorrection(
  landmarks: readonly Landmark[],
  corrections: readonly CorrectionRow[],
  imageWidth: number,
  imageHeight: number,
  minSamples: number = DEFAULT_MIN_SAMPLES,
): Landmark[] {
  const bias = computeBiasMap(corrections, minSamples);
  if (bias.size === 0) return landmarks.map((l) => ({ ...l }));

  return landmarks.map((lm) => {
    const b = bias.get(lm.name);
    if (!b) return { ...lm };
    const correctedX = lm.x + b.dxFrac * imageWidth;
    const correctedY = lm.y + b.dyFrac * imageHeight;
    return {
      ...lm,
      x: Math.max(0, Math.min(imageWidth, correctedX)),
      y: Math.max(0, Math.min(imageHeight, correctedY)),
    };
  });
}
