import { describe, it, expect } from "vitest";
import { COMMON_NATIONALITIES, allCountries, countryName, effectiveNationality, nationalityLabel } from "../nationality";
import { parseNationality } from "../invoices";

describe("effectiveNationality", () => {
  it("defaults to MY for a valid MyKad while the field is untouched", () => {
    expect(effectiveNationality(undefined, "850315-08-5234")).toBe("MY");
    expect(effectiveNationality(undefined, "850315085234")).toBe("MY");
  });
  it("has no default for a missing or invalid IC", () => {
    expect(effectiveNationality(undefined, "")).toBeNull();
    expect(effectiveNationality(undefined, "851315-08-5234")).toBeNull();
    expect(effectiveNationality(undefined, "A1234567")).toBeNull();
  });
  it("keeps what the user picked, including a deliberate clear", () => {
    expect(effectiveNationality("SG", "850315-08-5234")).toBe("SG");
    expect(effectiveNationality(null, "850315-08-5234")).toBeNull();
  });
});

describe("country names", () => {
  it("labels codes in English", () => {
    expect(countryName("sg")).toBe("Singapore");
    expect(nationalityLabel("MY")).toBe("Malaysia (MY)");
    expect(nationalityLabel(null)).toBeNull();
  });
  it("lists every code the API accepts, including the common ones", () => {
    const all = allCountries();
    const codes = new Set(all.map((c) => c.code));
    expect(all.length).toBeGreaterThan(200);
    for (const code of COMMON_NATIONALITIES) expect(codes.has(code)).toBe(true);
    expect(all.every((c) => parseNationality(c.code) === c.code)).toBe(true);
    expect(codes.has("XK")).toBe(false);
  });
});
