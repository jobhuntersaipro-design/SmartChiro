import { describe, it, expect } from "vitest";
import { expandSeries, MAX_SERIES_OCCURRENCES, type SeriesRule } from "@/lib/series";
import { clinicInstantFromInputs, clinicParts } from "@/lib/clinic-time";

// Clinic zone is Asia/Kuala_Lumpur (UTC+8, no DST). 2026-10-05 is a Monday.
const day = (iso: string) => clinicInstantFromInputs(iso);
const LONG_AGO = new Date("2020-01-01T00:00:00Z");
const iso = (dates: Date[]) => dates.map((d) => d.toISOString());

function rule(partial: Partial<SeriesRule>): SeriesRule {
  return { weekdays: [1, 3, 5], startTime: "09:00", intervalWeeks: 1, startDate: day("2026-10-05"), ...partial };
}

describe("expandSeries", () => {
  it("gives Mon/Wed/Fri 9:00 clinic time for N visits", () => {
    const out = expandSeries(rule({ count: 6 }), LONG_AGO);
    expect(iso(out)).toEqual([
      "2026-10-05T01:00:00.000Z",
      "2026-10-07T01:00:00.000Z",
      "2026-10-09T01:00:00.000Z",
      "2026-10-12T01:00:00.000Z",
      "2026-10-14T01:00:00.000Z",
      "2026-10-16T01:00:00.000Z",
    ]);
  });

  it("uses the clinic weekday, not the UTC one (7:00 MYT Monday is Sunday in UTC)", () => {
    const out = expandSeries(rule({ weekdays: [1], startTime: "07:00", count: 2 }), LONG_AGO);
    expect(iso(out)).toEqual(["2026-10-04T23:00:00.000Z", "2026-10-11T23:00:00.000Z"]);
    expect(out.every((d) => clinicParts(d).weekday === 1 && clinicParts(d).hour === 7)).toBe(true);
  });

  it("every 2 weeks counts from the Monday-start week of the start date", () => {
    // Starts Wednesday 7 Oct: Monday 5 Oct is before the start; week of 12 Oct is skipped.
    const out = expandSeries(rule({ weekdays: [1, 3], intervalWeeks: 2, startDate: day("2026-10-07"), count: 5 }), LONG_AGO);
    expect(out.map((d) => clinicParts(d).day)).toEqual([7, 19, 21, 2, 4]);
    expect(out.map((d) => clinicParts(d).month)).toEqual([10, 10, 10, 11, 11]);
  });

  it("a Sunday start belongs to the week that began the Monday before", () => {
    // Sunday 11 Oct is in the week of Mon 5 Oct → week 0; Mon 12 Oct is week 1 (skipped at interval 2).
    const out = expandSeries(rule({ weekdays: [0, 1], intervalWeeks: 2, startDate: day("2026-10-11"), count: 3 }), LONG_AGO);
    expect(out.map((d) => clinicParts(d).day)).toEqual([11, 19, 25]);
  });

  it("until is inclusive of that clinic day", () => {
    expect(expandSeries(rule({ until: day("2026-10-09") }), LONG_AGO)).toHaveLength(3);
    expect(expandSeries(rule({ until: day("2026-10-08") }), LONG_AGO)).toHaveLength(2);
    // An `until` given as a late-evening instant still means that clinic day.
    expect(expandSeries(rule({ until: new Date("2026-10-09T15:59:00Z") }), LONG_AGO)).toHaveLength(3);
  });

  it("count and until together stop at whichever comes first", () => {
    expect(expandSeries(rule({ count: 2, until: day("2026-10-30") }), LONG_AGO)).toHaveLength(2);
    expect(expandSeries(rule({ count: 20, until: day("2026-10-12") }), LONG_AGO)).toHaveLength(4);
  });

  it("skips occurrences at or before now and doesn't count them", () => {
    const now = new Date("2026-10-07T02:00:00Z"); // 10:00 MYT Wed — 9:00 already passed
    const out = expandSeries(rule({ count: 3 }), now);
    expect(out.map((d) => clinicParts(d).day)).toEqual([9, 12, 14]);
    const exactly = expandSeries(rule({ count: 1 }), new Date("2026-10-05T01:00:00Z"));
    expect(clinicParts(exactly[0]).day).toBe(7);
  });

  it("caps an open-ended rule at the maximum", () => {
    const out = expandSeries(rule({ weekdays: [0, 1, 2, 3, 4, 5, 6] }), LONG_AGO);
    expect(out).toHaveLength(MAX_SERIES_OCCURRENCES);
    expect(expandSeries(rule({ count: 500 }), LONG_AGO)).toHaveLength(MAX_SERIES_OCCURRENCES);
  });

  it("returns nothing for a bad time or no weekdays", () => {
    expect(expandSeries(rule({ startTime: "25:00", count: 3 }), LONG_AGO)).toEqual([]);
    expect(expandSeries(rule({ weekdays: [], count: 3 }), LONG_AGO)).toEqual([]);
    expect(expandSeries(rule({ weekdays: [9], count: 3 }), LONG_AGO)).toEqual([]);
  });

  it("is ordered and ignores duplicate weekdays", () => {
    const out = expandSeries(rule({ weekdays: [5, 1, 1], count: 4 }), LONG_AGO);
    expect(out.map((d) => clinicParts(d).day)).toEqual([5, 9, 12, 16]);
  });
});
