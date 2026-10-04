import { describe, it, expect } from "vitest";
import { normalizeIc, dobFromIc } from "@/lib/ic";
import { safeCallbackPath } from "@/lib/safe-callback";
import { isDateKey, intParam } from "@/lib/clinic-time";

describe("IC numbers (P1 / P11)", () => {
  it("stores a MyKad in one form, with or without dashes", () => {
    expect(normalizeIc("880412141234")).toBe("880412-14-1234");
    expect(normalizeIc(" 880412-14-1234 ")).toBe("880412-14-1234");
    expect(normalizeIc("A1234567")).toBe("A1234567");
    expect(normalizeIc("  ")).toBeNull();
    expect(normalizeIc(null)).toBeNull();
  });

  it("keeps a date of birth in the past: 27 is 1927 in 2026", () => {
    const now = new Date("2026-10-04T00:00:00Z");
    expect(dobFromIc("270101-14-1234", now)?.toISOString().slice(0, 10)).toBe("1927-01-01");
    expect(dobFromIc("290615-14-1234", now)?.toISOString().slice(0, 10)).toBe("1929-06-15");
    expect(dobFromIc("150101-14-1234", now)?.toISOString().slice(0, 10)).toBe("2015-01-01");
    // This year, but a date still to come: a century ago.
    expect(dobFromIc("261201-14-1234", now)?.toISOString().slice(0, 10)).toBe("1926-12-01");
    expect(dobFromIc("880230-14-1234", now)).toBeNull();
  });
});

describe("sign-in return path (P5)", () => {
  it("only same-site paths", () => {
    expect(safeCallbackPath("/dashboard/patients?x=1")).toBe("/dashboard/patients?x=1");
    expect(safeCallbackPath("//evil.example/x")).toBe("/dashboard");
    expect(safeCallbackPath("https://evil.example")).toBe("/dashboard");
    expect(safeCallbackPath("/\\evil.example")).toBe("/dashboard");
    expect(safeCallbackPath("/login")).toBe("/dashboard");
    expect(safeCallbackPath(undefined)).toBe("/dashboard");
  });
});

describe("query parsing (P10)", () => {
  it("rejects impossible dates and defaults bad numbers", () => {
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2028-02-29")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(intParam("abc", 50, 1, 100)).toBe(50);
    expect(intParam(null, 8, 1, 20)).toBe(8);
    expect(intParam("500", 50, 1, 100)).toBe(100);
    expect(intParam("-3", 50, 1, 100)).toBe(1);
  });
});
