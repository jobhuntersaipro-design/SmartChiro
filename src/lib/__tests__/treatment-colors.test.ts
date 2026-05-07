import { describe, it, expect } from "vitest";
import {
  TREATMENT_COLORS,
  TREATMENT_LABELS,
  TREATMENT_OPTIONS,
  treatmentTokensFor,
  treatmentLabelFor,
} from "../treatment-colors";

describe("treatment-colors", () => {
  it("provides tokens + label for every option in TREATMENT_OPTIONS", () => {
    for (const t of TREATMENT_OPTIONS) {
      expect(TREATMENT_COLORS[t]).toBeDefined();
      expect(TREATMENT_COLORS[t].bg).toMatch(/^#/);
      expect(TREATMENT_COLORS[t].pillBg).toMatch(/^#/);
      expect(TREATMENT_COLORS[t].pillText).toMatch(/^#/);
      expect(TREATMENT_COLORS[t].accent).toMatch(/^#/);
      expect(TREATMENT_LABELS[t].length).toBeGreaterThan(0);
    }
  });

  it("treatmentTokensFor falls back to OTHER for null/undefined/missing", () => {
    expect(treatmentTokensFor(null)).toEqual(TREATMENT_COLORS.OTHER);
    expect(treatmentTokensFor(undefined)).toEqual(TREATMENT_COLORS.OTHER);
  });

  it("treatmentLabelFor returns 'Other' for null/undefined", () => {
    expect(treatmentLabelFor(null)).toBe("Other");
    expect(treatmentLabelFor(undefined)).toBe("Other");
    expect(treatmentLabelFor("ADJUSTMENT")).toBe("Adjustment");
  });

  it("ADJUSTMENT and INITIAL_CONSULT get visually distinct accent colors", () => {
    const a = TREATMENT_COLORS.ADJUSTMENT.accent;
    const c = TREATMENT_COLORS.INITIAL_CONSULT.accent;
    expect(a).not.toEqual(c);
  });
});
