import { describe, it, expect } from "vitest";
import {
  parseOperatingHours,
  hasAnyHours,
  hoursForDay,
  isWithinHours,
  describeDayHours,
  summarizeOperatingHours,
  normalizeWorkingSchedule,
  outsideHoursSummary,
  formatTime12,
} from "../operating-hours";
import { clinicInstant } from "../clinic-time";

const NINE_TO_SIX = { open: "09:00", close: "18:00" };

describe("parseOperatingHours — JSON", () => {
  it("returns {} for null, empty and whitespace", () => {
    expect(parseOperatingHours(null)).toEqual({});
    expect(parseOperatingHours(undefined)).toEqual({});
    expect(parseOperatingHours("   ")).toEqual({});
  });

  it("parses the UI JSON format", () => {
    const json = JSON.stringify({ mon: NINE_TO_SIX, sat: { open: "09:00", close: "13:00" } });
    expect(parseOperatingHours(json)).toEqual({ mon: NINE_TO_SIX, sat: { open: "09:00", close: "13:00" } });
  });

  it("accepts long day keys and start/end", () => {
    const json = JSON.stringify({ monday: { start: "9:00", end: "17:30" }, Friday: NINE_TO_SIX });
    expect(parseOperatingHours(json)).toEqual({
      mon: { open: "09:00", close: "17:30" },
      fri: NINE_TO_SIX,
    });
  });

  it("drops null days, bad times and inverted ranges", () => {
    const json = JSON.stringify({
      mon: null,
      tue: { open: "25:00", close: "18:00" },
      wed: { open: "18:00", close: "09:00" },
      thu: NINE_TO_SIX,
      foo: NINE_TO_SIX,
    });
    expect(parseOperatingHours(json)).toEqual({ thu: NINE_TO_SIX });
  });

  it("returns {} for malformed JSON and non-object JSON", () => {
    expect(parseOperatingHours("{not json")).toEqual({});
    expect(parseOperatingHours("{}")).toEqual({});
  });
});

describe("parseOperatingHours — legacy free text", () => {
  it("parses 'Mon-Fri 9am-6pm, Sat 9am-1pm'", () => {
    expect(parseOperatingHours("Mon-Fri 9am-6pm, Sat 9am-1pm")).toEqual({
      mon: NINE_TO_SIX,
      tue: NINE_TO_SIX,
      wed: NINE_TO_SIX,
      thu: NINE_TO_SIX,
      fri: NINE_TO_SIX,
      sat: { open: "09:00", close: "13:00" },
    });
  });

  it("parses 24h times 'Mon-Sat 09:00-18:00'", () => {
    const map = parseOperatingHours("Mon-Sat 09:00-18:00");
    expect(Object.keys(map)).toEqual(["mon", "tue", "wed", "thu", "fri", "sat"]);
    expect(map.sat).toEqual(NINE_TO_SIX);
    expect(map.sun).toBeUndefined();
  });

  it("parses 'Daily 8am-8pm'", () => {
    const map = parseOperatingHours("Daily 8am-8pm");
    expect(Object.keys(map)).toHaveLength(7);
    expect(map.sun).toEqual({ open: "08:00", close: "20:00" });
  });

  it("treats a bare closing hour before the opening one as afternoon ('Mon-Fri 9-6')", () => {
    const map = parseOperatingHours("Mon-Fri 9-6");
    expect(map.mon).toEqual(NINE_TO_SIX);
    expect(map.fri).toEqual(NINE_TO_SIX);
  });

  it("shares the closing meridiem when it fits ('Sat 1-5pm', 'Sun 9-12pm')", () => {
    expect(parseOperatingHours("Sat 1-5pm").sat).toEqual({ open: "13:00", close: "17:00" });
    expect(parseOperatingHours("Sun 9-12pm").sun).toEqual({ open: "09:00", close: "12:00" });
  });

  it("handles long names, 'to', en dashes and minutes", () => {
    const map = parseOperatingHours("Monday to Wednesday 8:30 AM – 5:15 PM; Thursday 10am–7pm");
    expect(map.mon).toEqual({ open: "08:30", close: "17:15" });
    expect(map.wed).toEqual({ open: "08:30", close: "17:15" });
    expect(map.thu).toEqual({ open: "10:00", close: "19:00" });
    expect(map.fri).toBeUndefined();
  });

  it("carries days across commas to the next time ('Mon, Wed, Fri 9am-5pm')", () => {
    const map = parseOperatingHours("Mon, Wed, Fri 9am-5pm");
    expect(Object.keys(map)).toEqual(["mon", "wed", "fri"]);
  });

  it("honours 'closed' segments and weekday/weekend words", () => {
    const map = parseOperatingHours("Daily 9am-6pm, Sun closed");
    expect(map.sun).toBeUndefined();
    expect(map.sat).toEqual(NINE_TO_SIX);
    expect(Object.keys(parseOperatingHours("Weekdays 9am-6pm"))).toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });

  it("returns {} for text it can't read", () => {
    expect(parseOperatingHours("By appointment only")).toEqual({});
  });
});

describe("hasAnyHours / hoursForDay", () => {
  it("reports whether any day is open", () => {
    expect(hasAnyHours({})).toBe(false);
    expect(hasAnyHours({ sat: NINE_TO_SIX })).toBe(true);
  });

  it("indexes by weekday with 0 = Sunday", () => {
    const map = parseOperatingHours("Mon-Fri 9am-6pm");
    expect(hoursForDay(map, 0)).toBeNull();
    expect(hoursForDay(map, 1)).toEqual(NINE_TO_SIX);
    expect(hoursForDay(map, 6)).toBeNull();
  });
});

describe("isWithinHours (clinic time zone)", () => {
  const map = parseOperatingHours("Mon-Fri 9am-6pm, Sat 9am-1pm");

  it("accepts an appointment fully inside the window", () => {
    // Mon 4 May 2026, 09:00 in Kuala Lumpur
    expect(isWithinHours(map, clinicInstant(2026, 5, 4, 9, 0), 30)).toBe(true);
    expect(isWithinHours(map, clinicInstant(2026, 5, 4, 17, 30), 30)).toBe(true);
  });

  it("rejects starts before opening and ends after closing", () => {
    expect(isWithinHours(map, clinicInstant(2026, 5, 4, 8, 45), 30)).toBe(false);
    expect(isWithinHours(map, clinicInstant(2026, 5, 4, 17, 45), 30)).toBe(false);
    expect(isWithinHours(map, clinicInstant(2026, 5, 9, 12, 45), 30)).toBe(false); // Sat closes 1pm
  });

  it("rejects closed days", () => {
    expect(isWithinHours(map, clinicInstant(2026, 5, 10, 10, 0), 30)).toBe(false); // Sunday
  });

  it("uses the clinic day, not the UTC day", () => {
    // 02:00Z Monday = 10:00 Monday in KL → open.
    expect(isWithinHours(map, new Date("2026-05-04T02:00:00Z"), 30)).toBe(true);
    // 20:00Z Sunday = 04:00 Monday in KL → Monday, but before opening.
    expect(isWithinHours(map, new Date("2026-05-03T20:00:00Z"), 30)).toBe(false);
    // 23:30Z Friday = 07:30 Saturday in KL → not Friday's 9–6 window.
    expect(isWithinHours(map, new Date("2026-05-08T23:30:00Z"), 30)).toBe(false);
    // 01:30Z Saturday = 09:30 Saturday in KL → open.
    expect(isWithinHours(map, new Date("2026-05-09T01:30:00Z"), 30)).toBe(true);
  });
});

describe("formatting", () => {
  it("formats 12h times", () => {
    expect(formatTime12("09:00")).toBe("9:00 AM");
    expect(formatTime12("12:30")).toBe("12:30 PM");
    expect(formatTime12("00:15")).toBe("12:15 AM");
    expect(formatTime12("18:00")).toBe("6:00 PM");
  });

  it("describes a day's hours", () => {
    const map = parseOperatingHours("Mon-Fri 9am-6pm");
    expect(describeDayHours(map, 1)).toBe("Mon 9:00 AM–6:00 PM");
    expect(describeDayHours(map, 0)).toBe("Closed on Sunday");
  });

  it("summarises a week, grouping consecutive days", () => {
    expect(summarizeOperatingHours(parseOperatingHours("Mon-Fri 9am-6pm, Sat 9am-1pm"))).toBe(
      "Mon–Fri 9:00 AM–6:00 PM, Sat 9:00 AM–1:00 PM",
    );
    expect(summarizeOperatingHours(parseOperatingHours("Mon, Wed 9am-6pm"))).toBe(
      "Mon 9:00 AM–6:00 PM, Wed 9:00 AM–6:00 PM",
    );
    expect(summarizeOperatingHours({})).toBeNull();
  });
});

describe("outsideHoursSummary", () => {
  const raw = JSON.stringify({ mon: NINE_TO_SIX, sat: { open: "09:00", close: "13:00" } });

  it("returns null inside hours and for branches without hours", () => {
    expect(outsideHoursSummary(raw, clinicInstant(2026, 5, 4, 10, 0), 30)).toBeNull();
    expect(outsideHoursSummary(null, clinicInstant(2026, 5, 10, 22, 0), 30)).toBeNull();
    expect(outsideHoursSummary("By appointment only", clinicInstant(2026, 5, 10, 22, 0), 30)).toBeNull();
  });

  it("returns that day's hours when outside them", () => {
    expect(outsideHoursSummary(raw, clinicInstant(2026, 5, 4, 18, 0), 30)).toBe("Mon 9:00 AM–6:00 PM");
    expect(outsideHoursSummary(raw, clinicInstant(2026, 5, 10, 10, 0), 30)).toBe("Closed on Sunday");
  });
});

describe("normalizeWorkingSchedule", () => {
  it("returns null for non-objects", () => {
    expect(normalizeWorkingSchedule(null)).toBeNull();
    expect(normalizeWorkingSchedule("mon")).toBeNull();
    expect(normalizeWorkingSchedule([])).toBeNull();
  });

  it("maps long day keys to short keys and keeps null days", () => {
    expect(
      normalizeWorkingSchedule({
        monday: { start: "09:00", end: "18:00" },
        wednesday: null,
        saturday: { start: "9:00", end: "13:00" },
      }),
    ).toEqual({
      mon: { start: "09:00", end: "18:00" },
      wed: null,
      sat: { start: "09:00", end: "13:00" },
    });
  });

  it("passes short keys through and ignores unknown keys", () => {
    expect(normalizeWorkingSchedule({ tue: { start: "10:00", end: "19:00" }, holiday: {} })).toEqual({
      tue: { start: "10:00", end: "19:00" },
    });
  });
});
