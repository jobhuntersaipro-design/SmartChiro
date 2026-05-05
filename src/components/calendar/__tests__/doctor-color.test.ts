import { describe, it, expect } from "vitest";
import { doctorColor, DOCTOR_PALETTE } from "@/components/calendar/doctor-color";

describe("doctorColor", () => {
  it("returns one of the palette colors for any string id", () => {
    const c = doctorColor("any-doctor-id");
    expect(DOCTOR_PALETTE).toContain(c);
  });

  it("is deterministic — same id always returns same color", () => {
    const id = "personal-doctor-001";
    const a = doctorColor(id);
    const b = doctorColor(id);
    expect(a).toBe(b);
  });

  it("distributes different ids across the palette (not all same colour)", () => {
    const colors = new Set<string>();
    for (let i = 0; i < 50; i++) {
      colors.add(doctorColor(`doc-${i}`));
    }
    // With 12 colors and 50 ids, expect at least 6 unique colours hit.
    expect(colors.size).toBeGreaterThanOrEqual(6);
  });

  it("handles empty string without throwing", () => {
    expect(() => doctorColor("")).not.toThrow();
    expect(DOCTOR_PALETTE).toContain(doctorColor(""));
  });

  it("handles unicode and long ids", () => {
    expect(DOCTOR_PALETTE).toContain(doctorColor("한국의사"));
    expect(DOCTOR_PALETTE).toContain(doctorColor("a".repeat(500)));
  });
});

describe("DOCTOR_PALETTE", () => {
  it("contains exactly 12 hex colors", () => {
    expect(DOCTOR_PALETTE).toHaveLength(12);
    for (const c of DOCTOR_PALETTE) {
      expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
