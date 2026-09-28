import { describe, expect, it, vi } from "vitest";
import {
  appointmentHref,
  buildRepeatRule,
  carePlanProgressView,
  defaultRepeatState,
  defaultWeekdaysForVisits,
  describeOccurrenceProblems,
  forceOptionFor,
  packageCoversTreatment,
  parseRinggit,
  redemptionToast,
  repeatSummary,
  seriesBookedMessage,
  sessionsUsedLabel,
  toggleWeekday,
  treatmentTypesSummary,
  weekdayOfDateKey,
  type RepeatFormState,
} from "@/lib/package-ui";
import { bookSeries, followingUpdatedMessage, patchFollowing } from "@/lib/series-client";

const base: RepeatFormState = { enabled: true, weekdays: [1, 3, 5], intervalWeeks: 1, endMode: "count", count: 12, until: "" };

describe("repeat rule from the booking form", () => {
  it("defaults the weekday to the chosen date's weekday", () => {
    expect(weekdayOfDateKey("2026-10-05")).toBe(1); // Monday
    expect(weekdayOfDateKey("2026-10-04")).toBe(0); // Sunday
    expect(weekdayOfDateKey("05/10/2026")).toBeNull();
    expect(defaultRepeatState("2026-10-07")).toMatchObject({ enabled: false, weekdays: [3], intervalWeeks: 1, endMode: "count" });
  });

  it("builds a count rule with sorted, de-duplicated weekdays", () => {
    const r = buildRepeatRule({ ...base, weekdays: [5, 1, 3, 1] }, "2026-10-05", "09:30");
    expect(r).toEqual({
      ok: true,
      rule: { weekdays: [1, 3, 5], startTime: "09:30", intervalWeeks: 1, startDate: "2026-10-05", count: 12 },
    });
  });

  it("builds an until rule and rejects an end before the start", () => {
    const until = { ...base, endMode: "until" as const, until: "2026-11-30" };
    expect(buildRepeatRule(until, "2026-10-05", "09:30")).toMatchObject({ ok: true, rule: { until: "2026-11-30" } });
    expect(buildRepeatRule(until, "2026-10-05", "09:30")).not.toHaveProperty("rule.count");
    expect(buildRepeatRule({ ...until, until: "2026-10-01" }, "2026-10-05", "09:30")).toEqual({
      ok: false,
      error: "The end date is before the first visit.",
    });
    expect(buildRepeatRule({ ...until, until: "" }, "2026-10-05", "09:30")).toMatchObject({ ok: false });
  });

  it("explains what is missing", () => {
    expect(buildRepeatRule({ ...base, weekdays: [] }, "2026-10-05", "09:30")).toMatchObject({ ok: false, error: /weekday/ });
    expect(buildRepeatRule({ ...base, count: 0 }, "2026-10-05", "09:30")).toMatchObject({ ok: false });
    expect(buildRepeatRule({ ...base, count: 105 }, "2026-10-05", "09:30")).toMatchObject({ ok: false });
    expect(buildRepeatRule({ ...base, count: Number.NaN }, "2026-10-05", "09:30")).toMatchObject({ ok: false });
    expect(buildRepeatRule({ ...base, intervalWeeks: 13 }, "2026-10-05", "09:30")).toMatchObject({ ok: false });
    expect(buildRepeatRule(base, "", "09:30")).toMatchObject({ ok: false });
    expect(buildRepeatRule(base, "2026-10-05", "9:30")).toMatchObject({ ok: false });
  });

  it("toggles weekdays and spreads visits over the week", () => {
    expect(toggleWeekday([1, 5], 3)).toEqual([1, 3, 5]);
    expect(toggleWeekday([1, 3, 5], 3)).toEqual([1, 5]);
    expect(defaultWeekdaysForVisits(3)).toEqual([1, 3, 5]);
    expect(defaultWeekdaysForVisits(2)).toEqual([1, 4]);
    expect(defaultWeekdaysForVisits(0)).toEqual([1]);
    expect(defaultWeekdaysForVisits(9)).toHaveLength(7);
  });

  it("summarises a rule Monday-first", () => {
    expect(
      repeatSummary({ weekdays: [0, 1, 3], startTime: "09:00", intervalWeeks: 2, startDate: "2026-10-05", count: 6 }),
    ).toBe("Mon, Wed, Sun · every 2 weeks · 6 visits");
  });
});

describe("occurrence problems", () => {
  it("describes each problem with its detail", () => {
    expect(
      describeOccurrenceProblems({
        problems: ["conflict", "break", "outside_hours", "time_off", "past"],
        conflicts: [{ id: "a", dateTime: "", duration: 30, patient: { firstName: "Adam", lastName: "Yusoff" } }],
        breakLabel: "Lunch",
        hours: "Sat 9:00 AM–2:00 PM",
      }),
    ).toEqual([
      "Conflict with Adam Yusoff",
      "Doctor's break (Lunch)",
      "Outside opening hours (Sat 9:00 AM–2:00 PM)",
      "Doctor is on time off",
      "In the past",
    ]);
    expect(describeOccurrenceProblems({ problems: ["conflict", "break"] })).toEqual([
      "Conflicts with another booking",
      "Doctor's break",
    ]);
  });

  it("offers an override only where the API accepts one", () => {
    expect(forceOptionFor([{ problems: ["conflict"] }], true)).toBe("force");
    expect(forceOptionFor([{ problems: ["conflict"] }], false)).toBeNull();
    expect(forceOptionFor([{ problems: ["outside_hours"] }, { problems: ["outside_hours"] }], false)).toBe("outside_hours");
    expect(forceOptionFor([{ problems: ["past"] }, { problems: ["conflict"] }], true)).toBeNull();
    expect(forceOptionFor([], false)).toBeNull();
  });

  it("words the booking result", () => {
    expect(seriesBookedMessage(11, 1)).toBe("Booked 11 of 12 — 1 skipped");
    expect(seriesBookedMessage(6, 0)).toBe("Booked 6 visits");
    expect(seriesBookedMessage(1, 0)).toBe("Booked 1 visit");
    expect(followingUpdatedMessage(1)).toBe("Updated 1 appointment");
    expect(followingUpdatedMessage(4, true)).toBe("Cancelled 4 appointments");
  });
});

describe("packages", () => {
  it("labels sessions and redemptions", () => {
    expect(sessionsUsedLabel(5, 12)).toBe("5 of 12 used");
    expect(redemptionToast({ sessionsUsed: 5, sessionsTotal: 12, packageName: "12 Adjustments" })).toBe(
      "Session 5 of 12 used from 12 Adjustments",
    );
  });

  it("matches treatment types (empty = any)", () => {
    expect(packageCoversTreatment([], null)).toBe(true);
    expect(packageCoversTreatment(["ADJUSTMENT"], "ADJUSTMENT")).toBe(true);
    expect(packageCoversTreatment(["ADJUSTMENT"], "SOFT_TISSUE")).toBe(false);
    expect(packageCoversTreatment(["ADJUSTMENT"], null)).toBe(false);
    expect(treatmentTypesSummary([], (t) => t)).toBe("Any treatment");
    expect(treatmentTypesSummary(["a", "b", "c", "d", "e"], (t) => t.toUpperCase())).toBe("A, B, C +2");
  });

  it("parses ringgit amounts", () => {
    expect(parseRinggit("1,080")).toBe(1080);
    expect(parseRinggit("RM 99.50")).toBe(99.5);
    expect(parseRinggit("12.345")).toBeNull();
    expect(parseRinggit("-5")).toBeNull();
    expect(parseRinggit("")).toBeNull();
  });

  it("links to the appointment on its clinic day", () => {
    const href = appointmentHref("appt1", "2026-10-05T17:00:00.000Z", "b1");
    const params = new URL(href, "http://x").searchParams;
    expect(params.get("date")).toBe("2026-10-06"); // 1 AM next day in Kuala Lumpur
    expect(params.get("appointment")).toBe("appt1");
    expect(params.get("view")).toBe("list");
    expect(params.get("branch")).toBe("b1");
  });
});

describe("care plan progress", () => {
  it("splits the bar into completed and upcoming shares", () => {
    expect(carePlanProgressView({ completed: 3, upcoming: 6, cancelled: 1, noShow: 1, planned: 12 })).toEqual({
      completed: 3,
      upcoming: 6,
      missed: 1,
      planned: 12,
      unbooked: 3,
      completedPct: 25,
      upcomingPct: 50,
    });
  });

  it("never overflows 100% or goes negative", () => {
    const v = carePlanProgressView({ completed: 10, upcoming: 5, cancelled: 0, noShow: 0, planned: 12 });
    expect(v.completedPct + v.upcomingPct).toBeLessThanOrEqual(100);
    expect(v.unbooked).toBe(0);
    expect(carePlanProgressView({ completed: 0, upcoming: 0, cancelled: 0, noShow: 0, planned: 0 }).completedPct).toBe(0);
  });
});

describe("series client", () => {
  it("books a series and reports skipped dates", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ created: [1, 2, 3], skipped: [4] }), { status: 201 }));
    const r = await bookSeries(
      { branchId: "b", doctorId: "d", patientId: "p", weekdays: [1], startTime: "09:00", intervalWeeks: 1, startDate: "2026-10-05", count: 4, duration: 30, skipProblemDates: true },
      f as unknown as typeof fetch,
    );
    expect(r).toEqual({ ok: true, created: 3, skipped: 1, message: "Booked 3 of 4 — 1 skipped" });
    expect(f).toHaveBeenCalledWith("/api/appointment-series", expect.objectContaining({ method: "POST" }));
  });

  it("returns the problem dates of a refused series", async () => {
    const occ = [{ dateTime: "2026-10-05T01:00:00.000Z", ok: false, problems: ["conflict"] }];
    const f = vi.fn(async () => new Response(JSON.stringify({ error: "series_problems", message: "1 date has problems.", occurrences: occ }), { status: 409 }));
    const r = await bookSeries(
      { branchId: "b", doctorId: "d", patientId: "p", weekdays: [1], startTime: "09:00", intervalWeeks: 1, startDate: "2026-10-05", count: 1, duration: 30, skipProblemDates: false },
      f as unknown as typeof fetch,
    );
    expect(r).toEqual({ ok: false, message: "1 date has problems.", problems: occ });
  });

  it("PATCHes this-and-following and surfaces per-occurrence problems", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ count: 5 }), { status: 200 }));
    expect(await patchFollowing("a1", { dateTime: "2026-10-05T02:00:00.000Z" }, ok as unknown as typeof fetch)).toEqual({ ok: true, count: 5 });
    expect(ok).toHaveBeenCalledWith("/api/appointments/a1?scope=following", expect.objectContaining({ method: "PATCH" }));

    const occ = [{ appointmentId: "a2", seriesIndex: 3, dateTime: "2026-10-07T02:00:00.000Z", ok: false, problems: ["break"] }];
    const refused = vi.fn(async () => new Response(JSON.stringify({ error: "series_problems", message: "1 of 5 can't be moved.", occurrences: occ }), { status: 409 }));
    expect(await patchFollowing("a1", { duration: 45 }, refused as unknown as typeof fetch)).toEqual({
      ok: false,
      message: "1 of 5 can't be moved.",
      problems: occ,
    });

    const other = vi.fn(async () => new Response(JSON.stringify({ error: "cannot_reschedule_past", message: "Past appointments can't be moved." }), { status: 422 }));
    expect(await patchFollowing("a1", { duration: 45 }, other as unknown as typeof fetch)).toEqual({
      ok: false,
      message: "Past appointments can't be moved.",
      problems: null,
    });
  });
});
