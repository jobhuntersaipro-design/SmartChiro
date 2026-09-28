import { describe, it, expect } from "vitest";
import {
  expandBreakTimes,
  expandTimeOff,
  overlapsBreak,
  findOverlappingBreak,
  isOnTimeOff,
  type BreakRow,
  type TimeOffRow,
} from "../availability";
import { clinicInstant, clinicParts } from "../clinic-time";

const D1 = "doctor-1";

// Clinic wall-clock instants (Asia/Kuala_Lumpur), so the tests hold whatever TZ the process runs in.
const at = (month: number, day: number, hour = 0, minute = 0) => clinicInstant(2026, month, day, hour, minute);

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
    const start = at(5, 4); // Mon, 4 May 2026
    const end = at(5, 11); // Mon, 11 May 2026 (exclusive)
    const slots = expandBreakTimes(lunchMonFri, start, end);
    expect(slots).toHaveLength(5); // Mon-Fri
    expect(slots.every((s) => s.kind === "BREAK_TIME")).toBe(true);
    expect(slots.every((s) => s.label === "Lunch")).toBe(true);
  });

  it("places the break at clinic-local 12:00–13:00", () => {
    const slots = expandBreakTimes(lunchMonFri, at(5, 4), at(5, 5));
    expect(slots).toHaveLength(1);
    // 12:00 in Kuala Lumpur (UTC+8) is 04:00Z
    expect(slots[0].start).toBe("2026-05-04T04:00:00.000Z");
    expect(slots[0].end).toBe("2026-05-04T05:00:00.000Z");
  });

  it("returns empty when window collapses", () => {
    const start = at(5, 4);
    expect(expandBreakTimes(lunchMonFri, start, start)).toHaveLength(0);
    expect(expandBreakTimes(lunchMonFri, start, at(5, 3))).toHaveLength(0);
  });

  it("clips slots to the window bounds", () => {
    // Window starts at 12:30 PM Monday — should clip the start of that day's break
    const windowStart = at(5, 4, 12, 30);
    const windowEnd = at(5, 4, 14, 0);
    const slots = expandBreakTimes(lunchMonFri, windowStart, windowEnd);
    expect(slots).toHaveLength(1);
    const p = clinicParts(new Date(slots[0].start));
    expect(p.hour).toBe(12);
    expect(p.minute).toBe(30);
  });

  it("uses the clinic day for windows given as UTC midnight", () => {
    // 2026-05-03T16:00Z is 00:00 Monday in KL; a UTC-day loop would have started on Sunday.
    const slots = expandBreakTimes(lunchMonFri, new Date("2026-05-03T16:00:00Z"), new Date("2026-05-04T16:00:00Z"));
    expect(slots).toHaveLength(1);
    expect(slots[0].start).toBe("2026-05-04T04:00:00.000Z");
  });
});

describe("expandTimeOff", () => {
  it("returns slots for time-off rows that overlap the window", () => {
    const rows: TimeOffRow[] = [
      {
        userId: D1,
        branchId: null,
        type: "ANNUAL_LEAVE",
        startDate: at(5, 5),
        endDate: at(5, 8),
        notes: null,
      },
      {
        userId: D1,
        branchId: null,
        type: "SICK_LEAVE",
        startDate: at(5, 12), // outside window
        endDate: at(5, 13),
        notes: null,
      },
    ];
    const slots = expandTimeOff(rows, at(5, 4), at(5, 11));
    expect(slots).toHaveLength(1);
    expect(slots[0].kind).toBe("TIME_OFF");
    expect(slots[0].leaveType).toBe("ANNUAL_LEAVE");
  });
});

describe("overlapsBreak", () => {
  it("returns true when appointment falls inside the break", () => {
    // Mon 4 May 2026 12:30 PM clinic time, 30 min — should hit lunch
    expect(overlapsBreak(D1, at(5, 4, 12, 30), at(5, 4, 13, 0), lunchMonFri)).toBe(true);
  });

  it("returns false when appointment is before the break", () => {
    expect(overlapsBreak(D1, at(5, 4, 11, 0), at(5, 4, 11, 30), lunchMonFri)).toBe(false);
  });

  it("returns false on a weekend (no break that day)", () => {
    // Sat 9 May 2026 12:30 PM
    expect(overlapsBreak(D1, at(5, 9, 12, 30), at(5, 9, 13, 30), lunchMonFri)).toBe(false);
  });

  it("ignores other doctors' breaks", () => {
    expect(overlapsBreak("doctor-other", at(5, 4, 12, 30), at(5, 4, 13, 0), lunchMonFri)).toBe(false);
  });

  it("reads the break in clinic time, not UTC", () => {
    // 12:30Z Monday is 20:30 in KL — well after lunch.
    expect(
      overlapsBreak(D1, new Date("2026-05-04T12:30:00Z"), new Date("2026-05-04T13:00:00Z"), lunchMonFri),
    ).toBe(false);
    // 04:30Z Monday is 12:30 in KL — lunch.
    expect(
      overlapsBreak(D1, new Date("2026-05-04T04:30:00Z"), new Date("2026-05-04T05:00:00Z"), lunchMonFri),
    ).toBe(true);
  });

  it("uses the clinic weekday when the UTC date differs", () => {
    const sundayOnly: BreakRow[] = [
      { userId: D1, branchId: "b1", dayOfWeek: 0, startMinute: 7 * 60, endMinute: 8 * 60, label: "Early" },
    ];
    // 23:30Z Saturday = 07:30 Sunday in KL.
    const start = new Date("2026-05-09T23:30:00Z");
    const end = new Date("2026-05-10T00:00:00Z");
    expect(findOverlappingBreak(D1, start, end, sundayOnly)?.label).toBe("Early");
  });
});

describe("isOnTimeOff", () => {
  it("returns true when the appointment instant falls inside time-off", () => {
    const rows: TimeOffRow[] = [
      {
        userId: D1,
        branchId: null,
        type: "ANNUAL_LEAVE",
        startDate: at(5, 5),
        endDate: at(5, 8),
        notes: null,
      },
    ];
    expect(isOnTimeOff(D1, at(5, 6, 10), rows)).toBe(true);
    expect(isOnTimeOff(D1, at(5, 9, 10), rows)).toBe(false);
  });
});
