import { describe, it, expect } from "vitest";
import { clinicCalendar, clinicDayBounds, zoneOffsetMs } from "@/lib/clinic-time";

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
