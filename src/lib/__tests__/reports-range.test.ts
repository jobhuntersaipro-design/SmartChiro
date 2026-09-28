import { describe, it, expect } from "vitest";
import {
  addDaysToKey,
  detectPreset,
  formatRangeLabel,
  mondayOf,
  parseRange,
  presetRange,
} from "@/lib/reports/range";
import { bucketsFor, buildTrend, granularityFor } from "@/lib/reports/buckets";

// Wed 30 Sep 2026, 01:30 in Kuala Lumpur (still Tue 29 Sep in UTC).
const NOW = new Date("2026-09-29T17:30:00Z");

describe("presetRange (clinic days)", () => {
  it("uses the clinic day, not the UTC day", () => {
    expect(presetRange("today", NOW)).toEqual({ from: "2026-09-30", to: "2026-09-30" });
  });

  it("weeks start on Monday", () => {
    expect(presetRange("week", NOW)).toEqual({ from: "2026-09-28", to: "2026-10-04" });
  });

  it("months are whole months; last month wraps the year", () => {
    expect(presetRange("month", NOW)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("lastMonth", NOW)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    const jan = new Date("2026-01-10T04:00:00Z");
    expect(presetRange("lastMonth", jan)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("month", new Date("2028-02-10T04:00:00Z"))).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("last 90 days ends today", () => {
    const r = presetRange("last90", NOW);
    expect(r.to).toBe("2026-09-30");
    expect(r.from).toBe(addDaysToKey("2026-09-30", -89));
  });

  it("detects presets and falls back to custom", () => {
    expect(detectPreset({ from: "2026-09-01", to: "2026-09-30" }, NOW)).toBe("month");
    expect(detectPreset({ from: "2026-09-02", to: "2026-09-30" }, NOW)).toBe("custom");
  });
});

describe("parseRange", () => {
  it("defaults to this month", () => {
    const r = parseRange(null, null, NOW);
    expect(r.ok && [r.range.from, r.range.to, r.range.days]).toEqual(["2026-09-01", "2026-09-30", 30]);
  });

  it("turns clinic days into a half-open UTC window (to inclusive)", () => {
    const r = parseRange("2026-09-01", "2026-09-30", NOW);
    if (!r.ok) throw new Error("expected ok");
    expect(r.range.start.toISOString()).toBe("2026-08-31T16:00:00.000Z");
    expect(r.range.end.toISOString()).toBe("2026-09-30T16:00:00.000Z");
  });

  it("a single date means one day", () => {
    const r = parseRange("2026-09-15", null, NOW);
    expect(r.ok && r.range.days).toBe(1);
  });

  it("rejects bad input", () => {
    expect(parseRange("2026-02-30", "2026-03-01", NOW)).toMatchObject({ ok: false, error: "invalid_range" });
    expect(parseRange("15/09/2026", "2026-09-30", NOW)).toMatchObject({ ok: false, error: "invalid_range" });
    expect(parseRange("2026-09-30", "2026-09-01", NOW)).toMatchObject({ ok: false, error: "invalid_range" });
    expect(parseRange("2024-01-01", "2026-01-01", NOW)).toMatchObject({ ok: false, error: "range_too_long" });
  });

  it("labels ranges as dd/mm/yyyy", () => {
    expect(formatRangeLabel({ from: "2026-09-01", to: "2026-09-30" })).toBe("01/09/2026 – 30/09/2026");
    expect(formatRangeLabel({ from: "2026-09-01", to: "2026-09-01" })).toBe("01/09/2026");
  });
});

describe("bucketing", () => {
  it("daily up to 45 days, weekly after", () => {
    expect(granularityFor(1)).toBe("day");
    expect(granularityFor(45)).toBe("day");
    expect(granularityFor(46)).toBe("week");
  });

  it("mondayOf", () => {
    expect(mondayOf("2026-09-28")).toBe("2026-09-28");
    expect(mondayOf("2026-10-04")).toBe("2026-09-28");
    expect(mondayOf("2026-10-01")).toBe("2026-09-28");
  });

  it("weekly buckets start on Monday and clip to the range", () => {
    const b = bucketsFor({ from: "2026-09-02", to: "2026-09-15" }, "week");
    expect(b).toEqual([
      { key: "2026-08-31", from: "2026-09-02", to: "2026-09-06" },
      { key: "2026-09-07", from: "2026-09-07", to: "2026-09-13" },
      { key: "2026-09-14", from: "2026-09-14", to: "2026-09-15" },
    ]);
  });

  it("fills empty days and sums in sen", () => {
    const trend = buildTrend(
      { from: "2026-09-01", to: "2026-09-03" },
      [
        { day: "2026-09-01", collectedSen: 10, invoicedSen: 20 },
        { day: "2026-09-01", collectedSen: 20, invoicedSen: 0 },
        { day: "2026-09-03", collectedSen: 5, invoicedSen: 0 },
        { day: "2026-09-04", collectedSen: 999, invoicedSen: 999 },
      ],
      "day",
    );
    expect(trend.map((t) => [t.key, t.collected, t.invoiced])).toEqual([
      ["2026-09-01", 0.3, 0.2],
      ["2026-09-02", 0, 0],
      ["2026-09-03", 0.05, 0],
    ]);
  });

  it("weekly trend sums each week", () => {
    const trend = buildTrend(
      { from: "2026-09-01", to: "2026-10-31" },
      [
        { day: "2026-09-01", collectedSen: 100, invoicedSen: 0 },
        { day: "2026-09-06", collectedSen: 50, invoicedSen: 0 },
        { day: "2026-09-07", collectedSen: 1, invoicedSen: 0 },
      ],
      "week",
    );
    expect(trend[0]).toMatchObject({ key: "2026-08-31", from: "2026-09-01", collected: 1.5 });
    expect(trend[1]).toMatchObject({ key: "2026-09-07", collected: 0.01 });
    expect(trend.reduce((s, t) => s + t.collected, 0)).toBeCloseTo(1.51);
  });
});
