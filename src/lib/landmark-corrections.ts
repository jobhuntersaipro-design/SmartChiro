/**
 * Extract AI-landmark correction rows from a saved canvasState shape array.
 *
 * Every time a user saves an annotation, the route handler runs this on the
 * incoming shapes and upserts the result into the `AiLandmarkCorrection`
 * table. The rows form a queryable dataset of
 *   (image, landmark, AI guess, user-corrected position)
 * triples that will eventually drive bias correction / few-shot prompting /
 * fine-tuning. See current-feature.md §AI learning architecture.
 *
 * Filtering rules:
 *  - Only landmark shapes participate.
 *  - landmarkSource must be "manual" — the user has reviewed/dragged it.
 *  - landmarkOriginalX/Y must be set — only AI-placed landmarks have an
 *    original to compare against. Pure manual landmarks (placed from
 *    scratch) carry no AI guess and are skipped.
 *  - landmarkName must be a non-empty string — used as the row's stable
 *    identifier.
 *  - Position values must be finite numbers.
 *  - When the user drags a landmark back to exactly the AI's original
 *    position, no correction is emitted (it would be a zero-delta row).
 */

import type { BaseShape } from "@/types/annotation";

export interface LandmarkCorrectionRow {
  landmarkName: string;
  displayName: string;
  aiX: number;
  aiY: number;
  finalX: number;
  finalY: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function extractLandmarkCorrections(
  shapes: readonly BaseShape[],
): LandmarkCorrectionRow[] {
  const out: LandmarkCorrectionRow[] = [];
  const seen = new Set<string>();

  for (const s of shapes) {
    if (s.type !== "landmark") continue;
    if (s.landmarkSource !== "manual") continue;
    if (!isFiniteNumber(s.landmarkOriginalX) || !isFiniteNumber(s.landmarkOriginalY)) continue;
    if (typeof s.landmarkName !== "string" || s.landmarkName.length === 0) continue;
    if (!s.points || s.points.length === 0) continue;

    const final = s.points[0];
    if (!isFiniteNumber(final.x) || !isFiniteNumber(final.y)) continue;

    // Skip rows where the user dragged back to the exact AI position — no
    // signal there.
    if (final.x === s.landmarkOriginalX && final.y === s.landmarkOriginalY) continue;

    // De-dupe by landmark name within a single save. If a canvasState
    // somehow has two shapes with the same name (HMR collision, paste,
    // manual edit), keep the first — the unique constraint at the DB
    // level would reject the second anyway.
    if (seen.has(s.landmarkName)) continue;
    seen.add(s.landmarkName);

    out.push({
      landmarkName: s.landmarkName,
      displayName: s.label ?? s.landmarkName,
      aiX: s.landmarkOriginalX,
      aiY: s.landmarkOriginalY,
      finalX: final.x,
      finalY: final.y,
    });
  }

  return out;
}
