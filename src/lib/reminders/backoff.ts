export const MAX_ATTEMPTS = 3;

const LADDER_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

/** Delay (ms) before the next retry attempt, given the failure count so far. */
export function backoffMs(attemptCount: number): number {
  const idx = Math.max(0, Math.min(LADDER_MS.length - 1, attemptCount - 1));
  return LADDER_MS[idx];
}
