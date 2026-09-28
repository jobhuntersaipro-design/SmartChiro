import { describe, it, expect } from "vitest";
import { clinicCalendar, clinicDayBounds, zoneOffsetMs, clinicParts, clinicDateKey, clinicInstant, clinicInstantFromInputs, clinicTimeInput, formatInClinic, clinicUtcOffsetLabel } from '@/lib/clinic-time';

describe("clinic time (Asia/Kuala_Lumpur)", () => {
  // 07:30 on 28 Sep in Malaysia is still 27 Sep in UTC.
  const early = new Date("2026-09-27T23:30:00Z");

  it("uses the clinic's day, not the server's UTC day", () => {
    const cal = clinicCalendar(early, "Asia/Kuala_Lumpur");
    expect(cal.dayStart.toISOString()).toBe("2026-09-27T16:00:00.000Z"); // 28 Sep 00:00 MYT
    expect(cal.dayEnd.toISOString()).toBe("2026-09-28T16:00:00.000Z");
    expect(cal.monthStart.toISOString()).toBe("2026-08-31T16:00:00.000Z"); // 1 Sep MYT
    expect(cal.lastMonthStart.toISOString()).toBe("2026-07-31T16:00:00.000Z");
    expect(cal.weekStart.toISOString()).toBe("2026-09-26T16:00:00.000Z"); // Sun 27 Sep MYT
    expect(cal.addDays(7).toISOString()).toBe("2026-10-04T16:00:00.000Z");
  });

  it("knows Malaysia is UTC+8 and bounds a given date", () => {
    expect(zoneOffsetMs(early, "Asia/Kuala_Lumpur")).toBe(8 * 3600 * 1000);
    const { start, end } = clinicDayBounds("2026-09-28", "Asia/Kuala_Lumpur");
    expect(start.toISOString()).toBe("2026-09-27T16:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-28T16:00:00.000Z");
  });
});

describe("clinic wall-clock helpers", () => {
  const TZ = "Asia/Kuala_Lumpur";

  it("reads wall-clock parts in the clinic zone, not UTC", () => {
    // 23:30 MYT on 28 Sep = 15:30 UTC.
    const p = clinicParts(new Date("2026-09-28T15:30:00Z"), TZ);
    expect(p).toEqual({ year: 2026, month: 9, day: 28, hour: 23, minute: 30, weekday: 1 });
  });

  it("keys the clinic day across the UTC midnight edge", () => {
    // 07:00 MYT on 29 Sep is still 28 Sep in UTC.
    expect(clinicDateKey(new Date("2026-09-28T23:00:00Z"), TZ)).toBe("2026-09-29");
  });

  it("builds instants from clinic wall-clock inputs", () => {
    expect(clinicInstant(2026, 9, 28, 23, 30, TZ).toISOString()).toBe("2026-09-28T15:30:00.000Z");
    expect(clinicInstantFromInputs("2026-09-29", "00:15", TZ).toISOString()).toBe("2026-09-28T16:15:00.000Z");
  });

  it("round-trips a time input", () => {
    expect(clinicTimeInput(clinicInstantFromInputs("2026-09-28", "09:05", TZ), TZ)).toBe("09:05");
  });

  it("formats and labels the zone", () => {
    const at = new Date("2026-09-28T16:00:00Z"); // 00:00 MYT on 29 Sep
    expect(formatInClinic(at, { hour: "numeric", minute: "2-digit", hour12: true }, "en-US", TZ)).toBe("12:00 AM");
    expect(clinicUtcOffsetLabel(at, TZ)).toBe("+08:00");
  });
});
