import { describe, it, expect } from "vitest";
import type { OperatingHoursMap } from "@/types/branch";
import { clinicInstant, clinicTimeLabel } from "@/lib/clinic-time";
import {
  anyDoctorSlots,
  availableDays,
  bookingWindowKeys,
  dateKeysBetween,
  doctorSlots,
  slotsFor,
  workingWindow,
  type BookingDoctor,
  type SlotRules,
} from "../slots";

// 2026-10-05 is a Monday; clinic zone is Asia/Kuala_Lumpur (UTC+8, no DST).
const MON = "2026-10-05";
const SUN = "2026-10-04";
const HOURS: OperatingHoursMap = {
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "18:00" },
  sat: { open: "09:00", close: "13:00" },
};

const at = (key: string, hour: number, minute = 0) => {
  const [y, m, d] = key.split("-").map(Number);
  return clinicInstant(y, m, d, hour, minute);
};
const labels = (dates: Date[]) => dates.map((d) => clinicTimeLabel(d));

function doctor(overrides: Partial<BookingDoctor> = {}): BookingDoctor {
  return { doctorId: "doc-a", schedule: null, breaks: [], timeOff: [], busy: [], ...overrides };
}

function rules(overrides: Partial<SlotRules> = {}): SlotRules {
  return {
    branchHours: HOURS,
    durationMin: 30,
    stepMin: 15,
    leadMin: 120,
    now: at("2026-10-01", 9), // days before MON
    ...overrides,
  };
}

describe("doctorSlots — branch hours", () => {
  it("steps through the opening window in clinic time", () => {
    const slots = doctorSlots(doctor(), MON, rules());
    expect(slots).toHaveLength(35); // 09:00 … 17:30 every 15 min
    expect(slots[0].toISOString()).toBe("2026-10-05T01:00:00.000Z"); // 9:00 AM MYT
    expect(clinicTimeLabel(slots[0])).toBe("9:00 AM");
    expect(clinicTimeLabel(slots[slots.length - 1])).toBe("5:30 PM");
  });

  it("returns nothing on a closed day", () => {
    expect(doctorSlots(doctor(), SUN, rules())).toEqual([]);
  });

  it("only offers slots whose whole duration fits before closing", () => {
    const slots = doctorSlots(doctor(), "2026-10-10", rules({ durationMin: 60 })); // Saturday 9–13
    expect(labels(slots).at(-1)).toBe("12:00 PM");
  });

  it("aligns to the window start with the chosen step", () => {
    const slots = doctorSlots(doctor(), "2026-10-10", rules({ durationMin: 60, stepMin: 20 }));
    expect(labels(slots)).toEqual(["9:00 AM", "9:20 AM", "9:40 AM", "10:00 AM", "10:20 AM", "10:40 AM", "11:00 AM", "11:20 AM", "11:40 AM", "12:00 PM"]);
  });

  it("returns nothing when neither the doctor nor the branch has hours", () => {
    expect(doctorSlots(doctor(), MON, rules({ branchHours: {} }))).toEqual([]);
  });

  it("returns nothing for a zero duration or step", () => {
    expect(doctorSlots(doctor(), MON, rules({ durationMin: 0 }))).toEqual([]);
    expect(doctorSlots(doctor(), MON, rules({ stepMin: 0 }))).toEqual([]);
  });
});

describe("doctorSlots — lead time and past days", () => {
  it("drops slots inside the lead time, measured from now", () => {
    const slots = doctorSlots(doctor(), MON, rules({ now: at(MON, 10, 5), leadMin: 120 }));
    expect(clinicTimeLabel(slots[0])).toBe("12:15 PM"); // first grid slot at or after 12:05
  });

  it("zero lead time still hides slots that already started", () => {
    const slots = doctorSlots(doctor(), MON, rules({ now: at(MON, 16, 50), leadMin: 0 }));
    expect(labels(slots)).toEqual(["5:00 PM", "5:15 PM", "5:30 PM"]);
  });

  it("offers nothing on a past day", () => {
    expect(doctorSlots(doctor(), MON, rules({ now: at("2026-10-06", 8) }))).toEqual([]);
  });

  it("a late-evening lead time pushes into the next day's morning", () => {
    const now = at(MON, 23, 30); // 7:30 AM Tue is < 9:00 opening
    expect(labels(doctorSlots(doctor(), "2026-10-06", rules({ now, leadMin: 600 })))[0]).toBe("9:30 AM");
  });
});

describe("doctorSlots — breaks, time off, existing appointments", () => {
  it("skips slots overlapping a weekly break (clinic wall-clock)", () => {
    const doc = doctor({ breaks: [{ dayOfWeek: 1, startMinute: 12 * 60, endMinute: 13 * 60 }] });
    const l = labels(doctorSlots(doc, MON, rules()));
    expect(l).toContain("11:30 AM");
    expect(l).not.toContain("11:45 AM");
    expect(l).not.toContain("12:00 PM");
    expect(l).not.toContain("12:45 PM");
    expect(l).toContain("1:00 PM");
  });

  it("ignores breaks on other weekdays", () => {
    const doc = doctor({ breaks: [{ dayOfWeek: 2, startMinute: 12 * 60, endMinute: 13 * 60 }] });
    expect(doctorSlots(doc, MON, rules())).toHaveLength(35);
  });

  it("a full-day leave removes the day", () => {
    const doc = doctor({ timeOff: [{ startDate: at(MON, 0), endDate: at("2026-10-06", 0) }] });
    expect(doctorSlots(doc, MON, rules())).toEqual([]);
  });

  it("a partial leave cuts the afternoon", () => {
    const doc = doctor({ timeOff: [{ startDate: at(MON, 14), endDate: at(MON, 23) }] });
    expect(labels(doctorSlots(doc, MON, rules())).at(-1)).toBe("1:30 PM");
  });

  it("a multi-day leave spanning the date removes it", () => {
    const doc = doctor({ timeOff: [{ startDate: at("2026-10-01", 0), endDate: at("2026-10-09", 0) }] });
    expect(doctorSlots(doc, MON, rules())).toEqual([]);
  });

  it("existing appointments block overlapping slots but not touching ones", () => {
    const doc = doctor({ busy: [{ start: at(MON, 10), end: at(MON, 10, 30) }] });
    const l = labels(doctorSlots(doc, MON, rules()));
    expect(l).toContain("9:30 AM");
    expect(l).not.toContain("9:45 AM");
    expect(l).not.toContain("10:00 AM");
    expect(l).not.toContain("10:15 AM");
    expect(l).toContain("10:30 AM");
  });

  it("an appointment from the previous evening running past midnight doesn't leak", () => {
    const doc = doctor({ busy: [{ start: at("2026-10-04", 23), end: at(MON, 0, 30) }] });
    expect(doctorSlots(doc, MON, rules())).toHaveLength(35);
  });
});

describe("working window — doctor schedule vs branch hours", () => {
  it("uses the doctor's schedule, narrowed to branch hours", () => {
    const doc = doctor({ schedule: { mon: { start: "10:00", end: "14:00" } } });
    const l = labels(doctorSlots(doc, MON, rules()));
    expect(l[0]).toBe("10:00 AM");
    expect(l.at(-1)).toBe("1:30 PM");
  });

  it("clips a schedule that runs past the branch's hours", () => {
    const doc = doctor({ schedule: { mon: { start: "07:00", end: "21:00" } } });
    const l = labels(doctorSlots(doc, MON, rules()));
    expect(l[0]).toBe("9:00 AM");
    expect(l.at(-1)).toBe("5:30 PM");
  });

  it("a day off in the schedule means no slots even when the branch is open", () => {
    const doc = doctor({ schedule: { tue: { start: "09:00", end: "18:00" }, mon: null } });
    expect(doctorSlots(doc, MON, rules())).toEqual([]);
  });

  it("an empty schedule falls back to branch hours", () => {
    const doc = doctor({ schedule: { mon: null, tue: null } });
    expect(doctorSlots(doc, MON, rules())).toHaveLength(35);
  });

  it("a branch without any hours doesn't narrow the doctor's schedule", () => {
    const doc = doctor({ schedule: { sun: { start: "10:00", end: "12:00" } } });
    expect(labels(doctorSlots(doc, SUN, rules({ branchHours: {} })))).toEqual([
      "10:00 AM",
      "10:15 AM",
      "10:30 AM",
      "10:45 AM",
      "11:00 AM",
      "11:15 AM",
      "11:30 AM",
    ]);
  });

  it("the doctor's schedule can't open the branch on a closed day", () => {
    const doc = doctor({ schedule: { sun: { start: "10:00", end: "12:00" } } });
    expect(doctorSlots(doc, SUN, rules())).toEqual([]);
  });

  it("workingWindow rejects inverted ranges", () => {
    expect(workingWindow({ mon: { start: "14:00", end: "10:00" } }, HOURS, 1)).toBeNull();
    expect(workingWindow(null, HOURS, 1)).toEqual([540, 1080]);
    expect(workingWindow(null, HOURS, 0)).toBeNull();
  });
});

describe("any doctor", () => {
  it("is the union of every doctor's slots, sorted and de-duplicated", () => {
    const a = doctor({ doctorId: "a", schedule: { mon: { start: "09:00", end: "10:00" } } });
    const b = doctor({ doctorId: "b", schedule: { mon: { start: "09:30", end: "11:00" } } });
    const slots = anyDoctorSlots([a, b], MON, rules());
    expect(labels(slots.map((s) => s.start))).toEqual([
      "9:00 AM",
      "9:15 AM",
      "9:30 AM",
      "9:45 AM",
      "10:00 AM",
      "10:15 AM",
      "10:30 AM",
    ]);
    expect(slots[0].doctorId).toBe("a");
    expect(slots.at(-1)!.doctorId).toBe("b");
  });

  it("assigns the free doctor with the fewest bookings that day", () => {
    const a = doctor({ doctorId: "a", busy: [{ start: at(MON, 9), end: at(MON, 9, 30) }] });
    const b = doctor({
      doctorId: "b",
      busy: [
        { start: at(MON, 15), end: at(MON, 15, 30) },
        { start: at(MON, 16), end: at(MON, 16, 30) },
      ],
    });
    const slots = anyDoctorSlots([a, b], MON, rules());
    const byLabel = new Map(slots.map((s) => [clinicTimeLabel(s.start), s.doctorId]));
    expect(byLabel.get("9:00 AM")).toBe("b"); // a is busy
    expect(byLabel.get("1:00 PM")).toBe("a"); // a has 1 booking, b has 2
    expect(byLabel.get("3:00 PM")).toBe("a"); // b is busy
  });

  it("ties go to the earlier doctor in the list", () => {
    const slots = anyDoctorSlots([doctor({ doctorId: "x" }), doctor({ doctorId: "y" })], MON, rules());
    expect(new Set(slots.map((s) => s.doctorId))).toEqual(new Set(["x"]));
  });

  it("bookings on other days don't count towards the load", () => {
    const a = doctor({ doctorId: "a", busy: [{ start: at("2026-10-06", 9), end: at("2026-10-06", 10) }] });
    const b = doctor({ doctorId: "b" });
    expect(anyDoctorSlots([a, b], MON, rules())[0].doctorId).toBe("a");
  });

  it("slotsFor picks one doctor or the union", () => {
    const a = doctor({ doctorId: "a" });
    const b = doctor({ doctorId: "b", timeOff: [{ startDate: at(MON, 0), endDate: at(MON, 23) }] });
    expect(slotsFor([a, b], "b", MON, rules())).toEqual([]);
    expect(slotsFor([a, b], "a", MON, rules())).toHaveLength(35);
    expect(slotsFor([a, b], "any", MON, rules()).every((s) => s.doctorId === "a")).toBe(true);
    expect(slotsFor([a, b], "missing", MON, rules())).toEqual([]);
  });
});

describe("days", () => {
  it("availableDays lists days with at least one slot", () => {
    const doc = doctor({ timeOff: [{ startDate: at("2026-10-07", 0), endDate: at("2026-10-08", 0) }] });
    const days = availableDays([doc], "any", "2026-10-04", "2026-10-10", rules());
    expect(days).toEqual(["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09", "2026-10-10"]);
  });

  it("dateKeysBetween is inclusive and crosses month ends", () => {
    expect(dateKeysBetween("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(dateKeysBetween("2026-10-02", "2026-10-01")).toEqual([]);
  });

  it("bookingWindowKeys spans today to today + horizon", () => {
    expect(bookingWindowKeys("2026-09-28", 30)).toEqual({ first: "2026-09-28", last: "2026-10-28" });
  });

  it("MYT has a fixed +8 offset all year (no DST)", () => {
    expect(doctorSlots(doctor(), "2026-01-05", rules({ now: at("2026-01-01", 0) }))[0].toISOString()).toBe(
      "2026-01-05T01:00:00.000Z",
    );
    expect(doctorSlots(doctor(), "2026-07-06", rules({ now: at("2026-07-01", 0) }))[0].toISOString()).toBe(
      "2026-07-06T01:00:00.000Z",
    );
  });
});
