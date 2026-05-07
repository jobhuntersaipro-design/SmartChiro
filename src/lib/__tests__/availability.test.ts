import { describe, it, expect } from "vitest";
import {
  expandBreakTimes,
  expandTimeOff,
  overlapsBreak,
  isOnTimeOff,
  type BreakRow,
  type TimeOffRow,
} from "../availability";

const D1 = "doctor-1";

const lunchMonFri: BreakRow[] = [1, 2, 3, 4, 5].map((dow) => ({
  userId: D1,
  branchId: "b1",
  dayOfWeek: dow,
  startMinute: 12 * 60,
  endMinute: 13 * 60,
  label: "Lunch",
}));

describe("expandBreakTimes", () => {
  it("emits one slot per matching weekday in the window", () => {
    const start = new Date(2026, 4, 4); // Mon, 4 May 2026
    const end = new Date(2026, 4, 11); // Mon, 11 May 2026 (exclusive)
    const slots = expandBreakTimes(lunchMonFri, start, end);
    expect(slots).toHaveLength(5); // Mon-Fri
    expect(slots.every((s) => s.kind === "BREAK_TIME")).toBe(true);
    expect(slots.every((s) => s.label === "Lunch")).toBe(true);
  });

  it("returns empty when window collapses", () => {
    const start = new Date(2026, 4, 4);
    expect(expandBreakTimes(lunchMonFri, start, start)).toHaveLength(0);
    expect(expandBreakTimes(lunchMonFri, start, new Date(2026, 4, 3))).toHaveLength(0);
  });

  it("clips slots to the window bounds", () => {
    // Window starts at 12:30 PM Monday — should clip the start of that day's break
    const windowStart = new Date(2026, 4, 4, 12, 30);
    const windowEnd = new Date(2026, 4, 4, 14, 0);
    const slots = expandBreakTimes(lunchMonFri, windowStart, windowEnd);
    expect(slots).toHaveLength(1);
    expect(new Date(slots[0].start).getHours()).toBe(12);
    expect(new Date(slots[0].start).getMinutes()).toBe(30);
  });
});

describe("expandTimeOff", () => {
  it("returns slots for time-off rows that overlap the window", () => {
    const rows: TimeOffRow[] = [
      {
        userId: D1,
        branchId: null,
        type: "ANNUAL_LEAVE",
        startDate: new Date(2026, 4, 5),
        endDate: new Date(2026, 4, 8),
        notes: null,
      },
      {
        userId: D1,
        branchId: null,
        type: "SICK_LEAVE",
        startDate: new Date(2026, 4, 12), // outside window
        endDate: new Date(2026, 4, 13),
        notes: null,
      },
    ];
    const slots = expandTimeOff(
      rows,
      new Date(2026, 4, 4),
      new Date(2026, 4, 11)
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].kind).toBe("TIME_OFF");
    expect(slots[0].leaveType).toBe("ANNUAL_LEAVE");
  });
});

describe("overlapsBreak", () => {
  it("returns true when appointment falls inside the break", () => {
    // Mon 4 May 2026 12:30 PM, 30 min — should hit lunch
    const start = new Date(2026, 4, 4, 12, 30);
    const end = new Date(2026, 4, 4, 13, 0);
    expect(overlapsBreak(D1, start, end, lunchMonFri)).toBe(true);
  });

  it("returns false when appointment is before the break", () => {
    const start = new Date(2026, 4, 4, 11, 0);
    const end = new Date(2026, 4, 4, 11, 30);
    expect(overlapsBreak(D1, start, end, lunchMonFri)).toBe(false);
  });

  it("returns false on a weekend (no break that day)", () => {
    // Sat 9 May 2026 12:30 PM
    const start = new Date(2026, 4, 9, 12, 30);
    const end = new Date(2026, 4, 9, 13, 30);
    expect(overlapsBreak(D1, start, end, lunchMonFri)).toBe(false);
  });

  it("ignores other doctors' breaks", () => {
    const start = new Date(2026, 4, 4, 12, 30);
    const end = new Date(2026, 4, 4, 13, 0);
    expect(overlapsBreak("doctor-other", start, end, lunchMonFri)).toBe(false);
  });
});

describe("isOnTimeOff", () => {
  it("returns true when the appointment instant falls inside time-off", () => {
    const rows: TimeOffRow[] = [
      {
        userId: D1,
        branchId: null,
        type: "ANNUAL_LEAVE",
        startDate: new Date(2026, 4, 5),
        endDate: new Date(2026, 4, 8),
        notes: null,
      },
    ];
    expect(isOnTimeOff(D1, new Date(2026, 4, 6, 10), rows)).toBe(true);
    expect(isOnTimeOff(D1, new Date(2026, 4, 9, 10), rows)).toBe(false);
  });
});
