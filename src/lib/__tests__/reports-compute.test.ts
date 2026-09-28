import { describe, it, expect } from "vitest";
import { appointmentCounts, formatRate, rate } from "@/lib/reports/rates";
import { attributeDoctor, attributeTreatment, splitRevenue, type RevenueFact } from "@/lib/reports/revenue";
import { availableMinutes, mergeIntervals, minutesLeft } from "@/lib/reports/utilisation";
import { packageLiability } from "@/lib/reports/packages";
import { clinicInstant } from "@/lib/clinic-time";

describe("rates", () => {
  it("is null without a denominator", () => {
    expect(rate(1, 0)).toBeNull();
    expect(rate(0, 0)).toBeNull();
    expect(rate(1, 4)).toBe(0.25);
    expect(formatRate(null)).toBe("—");
    expect(formatRate(0.125)).toBe("12.5%");
    expect(formatRate(0.2)).toBe("20%");
  });

  it("no-show rate = no-show ÷ (completed + no-show); cancellation = cancelled ÷ booked", () => {
    const c = appointmentCounts([
      { status: "COMPLETED", count: 6 },
      { status: "NO_SHOW", count: 2 },
      { status: "CANCELLED", count: 2 },
      { status: "SCHEDULED", count: 1 },
      { status: "CHECKED_IN", count: 1 },
    ]);
    expect(c).toMatchObject({ booked: 12, completed: 6, noShow: 2, cancelled: 2, open: 2 });
    expect(c.noShowRate).toBe(0.25);
    expect(c.cancellationRate).toBeCloseTo(2 / 12);
  });

  it("empty counts have no rates", () => {
    const c = appointmentCounts([{ status: "SCHEDULED", count: 3 }]);
    expect(c.noShowRate).toBeNull();
    expect(c.cancellationRate).toBe(0);
    expect(appointmentCounts([]).cancellationRate).toBeNull();
  });
});

describe("revenue attribution", () => {
  const base = { day: "2026-09-01", branchId: "b1", treatmentType: null, collectedSen: 0, invoicedSen: 0 };

  it("package sales, then the appointment's doctor, else no appointment", () => {
    expect(attributeDoctor({ doctorId: "d1", isPackageSale: true })).toEqual({ kind: "package_sales", key: "package_sales" });
    expect(attributeDoctor({ doctorId: "d1", isPackageSale: false })).toEqual({ kind: "doctor", key: "d1" });
    expect(attributeDoctor({ doctorId: null, isPackageSale: false })).toEqual({ kind: "no_appointment", key: "no_appointment" });
  });

  it("treatment rows follow the same fixed buckets", () => {
    expect(attributeTreatment({ doctorId: "d1", treatmentType: "ADJUSTMENT", isPackageSale: false }).name).toBe("Adjustment");
    expect(attributeTreatment({ doctorId: "d1", treatmentType: null, isPackageSale: false }).name).toBe("Treatment not set");
    expect(attributeTreatment({ doctorId: null, treatmentType: null, isPackageSale: false }).name).toBe("No appointment");
    expect(attributeTreatment({ doctorId: null, treatmentType: null, isPackageSale: true }).name).toBe("Package sales");
  });

  it("every split sums to the totals", () => {
    const facts: RevenueFact[] = [
      { ...base, doctorId: "d1", treatmentType: "ADJUSTMENT", isPackageSale: false, collectedSen: 12050, invoicedSen: 15000 },
      { ...base, doctorId: "d2", treatmentType: "GONSTEAD", isPackageSale: false, collectedSen: 10000, invoicedSen: 0 },
      { ...base, branchId: "b2", doctorId: null, isPackageSale: true, collectedSen: 60000, invoicedSen: 60000 },
      { ...base, branchId: "b2", doctorId: null, isPackageSale: false, collectedSen: -2000, invoicedSen: 3000 },
    ];
    const s = splitRevenue(
      facts,
      { branches: new Map([["b1", "KLCC"], ["b2", "Bangsar"], ["b3", "Penang"]]), doctors: new Map([["d1", "Dr. Aisha"], ["d2", "Tan"]]) },
      ["b1", "b2", "b3"],
    );
    expect(s.totals).toEqual({ collected: 800.5, invoiced: 780 });
    for (const split of [s.byBranch, s.byDoctor, s.byTreatment]) {
      expect(split.reduce((sum, r) => sum + r.collected, 0)).toBeCloseTo(800.5, 2);
      expect(split.reduce((sum, r) => sum + r.invoiced, 0)).toBeCloseTo(780, 2);
    }
    expect(s.byBranch.map((b) => b.name)).toEqual(["Bangsar", "KLCC", "Penang"]);
    expect(s.byDoctor.map((d) => [d.name, d.kind, d.collected])).toEqual([
      ["Package sales", "package_sales", 600],
      ["Dr. Aisha", "doctor", 120.5],
      ["Dr. Tan", "doctor", 100],
      ["No appointment", "no_appointment", -20],
    ]);
  });
});

describe("utilisation available minutes", () => {
  it("merges and subtracts intervals", () => {
    expect(mergeIntervals([[60, 120], [100, 180], [300, 310], [5, 5]])).toEqual([[60, 180], [300, 310]]);
    expect(minutesLeft([[540, 1080]], [[720, 780], [1050, 1200]])).toBe(540 - 60 - 30);
  });

  // Mon 7 – Sun 13 Sep 2026.
  const week = { from: "2026-09-07", to: "2026-09-13" };

  it("uses the weekly schedule minus breaks and time off", () => {
    const r = availableMinutes({
      range: week,
      schedule: { mon: { start: "09:00", end: "17:00" }, wed: { start: "09:00", end: "13:00" }, sun: null },
      branchHours: [{ mon: { open: "08:00", close: "20:00" } }],
      breaks: [{ dayOfWeek: 1, startMinute: 12 * 60, endMinute: 13 * 60 }],
      // Wednesday 11:00–15:00 off (clinic time) → 2h of the 4h morning lost.
      timeOff: [{ startDate: clinicInstant(2026, 9, 9, 11), endDate: clinicInstant(2026, 9, 9, 15) }],
    });
    expect(r).toEqual({ availableMinutes: 8 * 60 - 60 + 2 * 60, source: "schedule" });
  });

  it("falls back to the union of branch hours", () => {
    const r = availableMinutes({
      range: { from: "2026-09-07", to: "2026-09-08" },
      schedule: { mon: null },
      branchHours: [{ mon: { open: "09:00", close: "13:00" } }, { mon: { open: "12:00", close: "18:00" }, tue: { open: "09:00", close: "10:00" } }],
      breaks: [],
      timeOff: [],
    });
    expect(r).toEqual({ availableMinutes: 9 * 60 + 60, source: "branch_hours" });
  });

  it("a break overlapping time off isn't subtracted twice; whole-day leave zeroes the day", () => {
    const r = availableMinutes({
      range: { from: "2026-09-07", to: "2026-09-08" },
      schedule: { mon: { start: "09:00", end: "17:00" }, tue: { start: "09:00", end: "17:00" } },
      branchHours: [],
      breaks: [{ dayOfWeek: 1, startMinute: 12 * 60, endMinute: 13 * 60 }, { dayOfWeek: 2, startMinute: 12 * 60, endMinute: 13 * 60 }],
      timeOff: [{ startDate: clinicInstant(2026, 9, 7, 0), endDate: clinicInstant(2026, 9, 8, 0) }, { startDate: clinicInstant(2026, 9, 8, 12, 30), endDate: clinicInstant(2026, 9, 8, 14) }],
    });
    expect(r.availableMinutes).toBe(8 * 60 - 120);
  });

  it("no schedule and no hours → nothing available", () => {
    expect(availableMinutes({ range: week, schedule: null, branchHours: [{}], breaks: [], timeOff: [] })).toEqual({
      availableMinutes: 0,
      source: "none",
    });
  });
});

describe("package liability", () => {
  const now = new Date("2026-09-15T00:00:00Z");
  const pkg = (over: Partial<Parameters<typeof packageLiability>[0][number]>) => ({
    name: "12 adjustments",
    status: "ACTIVE" as const,
    sessionsTotal: 12,
    sessionsUsed: 0,
    price: 1200,
    expiresAt: null,
    ...over,
  });

  it("sessions left × unit value for usable packages only", () => {
    const s = packageLiability(
      [
        pkg({ sessionsUsed: 4 }), // 8 × 100
        pkg({ sessionsUsed: 2, expiresAt: new Date("2026-10-01T00:00:00Z") }), // 10 × 100, expiring soon
        pkg({ name: "5 sessions", sessionsTotal: 3, price: { toString: () => "100.00" }, sessionsUsed: 1 }), // 2 × 33.33
        pkg({ sessionsUsed: 12 }), // used up
        pkg({ expiresAt: new Date("2026-09-01T00:00:00Z") }), // expired
        pkg({ status: "CANCELLED" }),
      ],
      now,
    );
    expect(s.active).toBe(3);
    expect(s.sessionsOutstanding).toBe(20);
    expect(s.liability).toBeCloseTo(1866.66, 2);
    expect(s.expiringSoon).toEqual({ count: 1, sessions: 10, liability: 1000 });
    expect(s.byPackage).toEqual([
      { name: "12 adjustments", active: 2, sessionsLeft: 18, liability: 1800, expiringSoon: 1 },
      { name: "5 sessions", active: 1, sessionsLeft: 2, liability: 66.66, expiringSoon: 0 },
    ]);
  });
});
