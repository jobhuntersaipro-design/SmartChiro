import { describe, expect, it } from "vitest";
import {
  dateFromIso,
  dateOutOfRange,
  formatDateInput,
  isIsoDate,
  isoFromDate,
  parseDateInput,
  validateDateInput,
} from "@/lib/date-input";

describe("parseDateInput", () => {
  it("reads dd/mm/yyyy as day first", () => {
    expect(parseDateInput("05/01/1990")).toEqual({ ok: true, iso: "1990-01-05" });
  });

  it("tolerates single digits, dashes, dots and no separators", () => {
    expect(parseDateInput("5/1/1990")).toEqual({ ok: true, iso: "1990-01-05" });
    expect(parseDateInput("05-01-1990")).toEqual({ ok: true, iso: "1990-01-05" });
    expect(parseDateInput("05.01.1990")).toEqual({ ok: true, iso: "1990-01-05" });
    expect(parseDateInput("05011990")).toEqual({ ok: true, iso: "1990-01-05" });
    expect(parseDateInput("  31/12/2026 ")).toEqual({ ok: true, iso: "2026-12-31" });
  });

  it("rejects impossible dates", () => {
    expect(parseDateInput("31/02/2026")).toEqual({ ok: false, reason: "invalid" });
    expect(parseDateInput("29/02/2026")).toEqual({ ok: false, reason: "invalid" });
    expect(parseDateInput("00/01/2026")).toEqual({ ok: false, reason: "invalid" });
    expect(parseDateInput("12/13/2026")).toEqual({ ok: false, reason: "invalid" });
  });

  it("accepts 29 February in a leap year", () => {
    expect(parseDateInput("29/02/2028")).toEqual({ ok: true, iso: "2028-02-29" });
  });

  it("rejects two-digit and partial years", () => {
    expect(parseDateInput("05/01/90")).toEqual({ ok: false, reason: "year" });
    expect(parseDateInput("050190")).toEqual({ ok: false, reason: "year" });
    expect(parseDateInput("05/01/199")).toEqual({ ok: false, reason: "year" });
    expect(parseDateInput("05/01/")).toEqual({ ok: false, reason: "year" });
  });

  it("rejects other shapes", () => {
    expect(parseDateInput("")).toEqual({ ok: false, reason: "empty" });
    expect(parseDateInput("1990-01-05")).toEqual({ ok: false, reason: "format" });
    expect(parseDateInput("Jan 5 1990")).toEqual({ ok: false, reason: "format" });
  });
});

describe("formatDateInput / isIsoDate", () => {
  it("formats ISO dates as dd/mm/yyyy", () => {
    expect(formatDateInput("1990-01-05")).toBe("05/01/1990");
    expect(formatDateInput("")).toBe("");
    expect(formatDateInput(null)).toBe("");
    expect(formatDateInput("2026-02-31")).toBe("");
  });

  it("only accepts real YYYY-MM-DD dates", () => {
    expect(isIsoDate("2026-09-28")).toBe(true);
    expect(isIsoDate("2026-9-28")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
  });
});

describe("validateDateInput with min/max", () => {
  const bounds = { min: "2026-01-01", max: "2026-12-31" };

  it("returns the ISO value inside the range, bounds inclusive", () => {
    expect(validateDateInput("01/01/2026", bounds)).toEqual({ iso: "2026-01-01", error: null });
    expect(validateDateInput("31/12/2026", bounds)).toEqual({ iso: "2026-12-31", error: null });
  });

  it("rejects dates outside the range with the bound in dd/mm/yyyy", () => {
    expect(validateDateInput("31/12/2025", bounds)).toEqual({
      iso: "",
      error: "Date must be on or after 01/01/2026",
    });
    expect(validateDateInput("01/01/2027", bounds)).toEqual({
      iso: "",
      error: "Date must be on or before 31/12/2026",
    });
  });

  it("empty text is valid and empty", () => {
    expect(validateDateInput("  ", bounds)).toEqual({ iso: "", error: null });
  });

  it("explains invalid text", () => {
    expect(validateDateInput("31/02/2026").error).toBe("31/02/2026 is not a real date");
    expect(validateDateInput("05/01/90").error).toMatch(/full year/);
    expect(validateDateInput("abc").error).toBe("Enter a date as dd/mm/yyyy");
  });

  it("dateOutOfRange ignores missing or malformed bounds", () => {
    expect(dateOutOfRange("2026-05-05", {})).toBeNull();
    expect(dateOutOfRange("2026-05-05", { min: "nope" })).toBeNull();
  });
});

describe("calendar bridge", () => {
  it("round-trips through a local Date without shifting the day", () => {
    const d = dateFromIso("1990-01-05");
    expect(d?.getFullYear()).toBe(1990);
    expect(d?.getMonth()).toBe(0);
    expect(d?.getDate()).toBe(5);
    expect(isoFromDate(d!)).toBe("1990-01-05");
    expect(dateFromIso("")).toBeUndefined();
  });
});
