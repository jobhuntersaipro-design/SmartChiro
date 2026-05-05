// Stripe-Inspired pastel palette — distinct enough to read at a glance, soft enough
// to not visually scream when many events are stacked. 12 entries; collisions
// possible with >12 doctors per branch (acceptable for v1, see spec §12 risk note).
export const DOCTOR_PALETTE = [
  "#635BFF", // Indigo (primary)
  "#0570DE", // Info blue
  "#15BE53", // Green
  "#F5A623", // Amber
  "#DF1B41", // Danger red
  "#9B6829", // Tan
  "#00B8D9", // Cyan
  "#7C3AED", // Violet
  "#EC4899", // Pink
  "#10B981", // Emerald
  "#F97316", // Orange
  "#3B82F6", // Sky blue
] as const;

// FNV-1a 32-bit hash — small, stable, deterministic across JS runtimes.
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function doctorColor(id: string): string {
  if (!id) return DOCTOR_PALETTE[0];
  const idx = fnv1a(id) % DOCTOR_PALETTE.length;
  return DOCTOR_PALETTE[idx];
}
