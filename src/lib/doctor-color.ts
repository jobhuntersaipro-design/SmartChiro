// Deterministic doctor → color mapping. Stable across renders and reloads.
// 8 desaturated palette options that work on white card backgrounds and pass
// 4.5:1 contrast for the text color. Used by tables that show many rows from
// many doctors so an owner can scan visually.

const PALETTE = [
  { bg: "#EFF6FF", text: "#1E3A8A", dot: "#3B82F6" }, // sky
  { bg: "#F0FDF4", text: "#14532D", dot: "#22C55E" }, // sage
  { bg: "#FEF3F2", text: "#7F1D1D", dot: "#EF4444" }, // rose
  { bg: "#FEFCE8", text: "#713F12", dot: "#EAB308" }, // sand
  { bg: "#F5F3FF", text: "#4C1D95", dot: "#8B5CF6" }, // lavender
  { bg: "#ECFEFF", text: "#155E75", dot: "#06B6D4" }, // mint
  { bg: "#FFF7ED", text: "#7C2D12", dot: "#F97316" }, // peach
  { bg: "#FDF2F8", text: "#831843", dot: "#EC4899" }, // coral
] as const;

export type DoctorColor = (typeof PALETTE)[number];

// Stable string-hash → palette index. djb2 variant.
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getDoctorColor(doctorId: string): DoctorColor {
  return PALETTE[hash(doctorId) % PALETTE.length];
}
