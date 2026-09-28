import { describe, it, expect } from "vitest";
import {
  commissionTotals,
  computeCommissions,
  describeRate,
  resolveRule,
  type CommissionFact,
  type CommissionRuleLike,
} from "@/lib/commissions";

const B = "branch-1";
const JAN = new Date("2026-01-01T00:00:00.000Z");
const at = (iso: string) => new Date(`${iso}T03:00:00.000Z`);

let n = 0;
const rule = (r: Partial<CommissionRuleLike> & Pick<CommissionRuleLike, "basis" | "rate">): CommissionRuleLike => ({
  id: `r${++n}`,
  branchId: B,
  doctorId: null,
  treatmentType: null,
  effectiveFrom: JAN,
  active: true,
  ...r,
});

const q = (userId: string, treatmentType: string | null, date = "2026-06-01") => ({
  stream: "service" as const,
  branchId: B,
  userId,
  treatmentType,
  at: at(date),
});

describe("resolveRule", () => {
  const all = rule({ basis: "PERCENT_COLLECTED", rate: 10 });
  const treatment = rule({ basis: "PERCENT_COLLECTED", rate: 15, treatmentType: "GONSTEAD" });
  const doctor = rule({ basis: "FIXED_PER_VISIT", rate: 40, doctorId: "dr-a" });
  const both = rule({ basis: "PERCENT_COLLECTED", rate: 25, doctorId: "dr-a", treatmentType: "GONSTEAD" });
  const rules = [all, treatment, doctor, both];

  it("doctor + treatment > doctor > treatment > all", () => {
    expect(resolveRule(rules, q("dr-a", "GONSTEAD"))?.id).toBe(both.id);
    expect(resolveRule(rules, q("dr-a", "ADJUSTMENT"))?.id).toBe(doctor.id);
    expect(resolveRule(rules, q("dr-b", "GONSTEAD"))?.id).toBe(treatment.id);
    expect(resolveRule(rules, q("dr-b", null))?.id).toBe(all.id);
  });

  it("skips inactive, future, other-branch and other-stream rules", () => {
    const future = rule({ basis: "PERCENT_COLLECTED", rate: 50, doctorId: "dr-c", effectiveFrom: new Date("2026-07-01T00:00:00.000Z") });
    const inactive = rule({ basis: "PERCENT_COLLECTED", rate: 60, doctorId: "dr-c", active: false });
    const other = rule({ basis: "PERCENT_COLLECTED", rate: 70, doctorId: "dr-c", branchId: "branch-2" });
    const pkg = rule({ basis: "PERCENT_PACKAGE_SALE", rate: 5, doctorId: "dr-c" });
    const set = [all, future, inactive, other, pkg];
    expect(resolveRule(set, q("dr-c", null, "2026-06-30"))?.id).toBe(all.id);
    expect(resolveRule(set, q("dr-c", null, "2026-07-02"))?.id).toBe(future.id);
    expect(resolveRule(set, { ...q("dr-c", null), stream: "package" })?.id).toBe(pkg.id);
    expect(resolveRule([inactive], q("dr-c", null))).toBeNull();
  });

  it("among equally specific rules the latest effective date wins", () => {
    const old = rule({ basis: "PERCENT_COLLECTED", rate: 10, doctorId: "dr-d" });
    const raise = rule({ basis: "PERCENT_COLLECTED", rate: 12, doctorId: "dr-d", effectiveFrom: new Date("2026-05-01T00:00:00.000Z") });
    expect(resolveRule([raise, old], q("dr-d", null, "2026-04-30"))?.id).toBe(old.id);
    expect(resolveRule([old, raise], q("dr-d", null, "2026-05-02"))?.id).toBe(raise.id);
  });
});

describe("computeCommissions", () => {
  const fact = (f: Partial<CommissionFact> & Pick<CommissionFact, "kind" | "userId">): CommissionFact => ({
    branchId: B,
    treatmentType: null,
    at: at("2026-06-10"),
    amountSen: 0,
    ...f,
  });

  it("applies % of collected, fixed per visit and % of package sales", () => {
    const rules = [
      rule({ basis: "PERCENT_COLLECTED", rate: 10 }),
      rule({ basis: "FIXED_PER_VISIT", rate: 40, doctorId: "dr-b" }),
      rule({ basis: "PERCENT_PACKAGE_SALE", rate: 5 }),
    ];
    const rows = computeCommissions(rules, [
      fact({ kind: "payment", userId: "dr-a", amountSen: 15000 }),
      fact({ kind: "payment", userId: "dr-a", amountSen: -2000 }), // refund
      fact({ kind: "visit", userId: "dr-a" }), // dr-a is on a % rule: no per-visit pay
      fact({ kind: "payment", userId: "dr-b", amountSen: 10000 }), // dr-b is on the fixed rule
      fact({ kind: "visit", userId: "dr-b" }),
      fact({ kind: "visit", userId: "dr-b" }),
      fact({ kind: "package", userId: "desk-c", amountSen: 60000 }),
    ]);
    const byUser = Object.fromEntries(rows.map((r) => [r.userId, r]));
    expect(byUser["dr-a"]).toMatchObject({ collected: 130, collectedCommission: 13, visits: 1, visitCommission: 0, total: 13 });
    expect(byUser["dr-b"]).toMatchObject({ collected: 100, collectedCommission: 0, visits: 2, visitCommission: 80, total: 80 });
    expect(byUser["desk-c"]).toMatchObject({ packageSales: 600, packageCommission: 30, total: 30 });
    expect(commissionTotals(rows)).toMatchObject({ collected: 230, visits: 3, packageSales: 600, total: 123 });
  });

  it("rounds once per rule to the sen, half up", () => {
    const rules = [rule({ basis: "PERCENT_COLLECTED", rate: 12.5 })];
    // 3 × RM 0.99 at 12.5% = 0.37125 → 0.37 (per payment would give 3 × 0.12 = 0.36).
    const rows = computeCommissions(rules, [1, 2, 3].map(() => fact({ kind: "payment", userId: "dr-a", amountSen: 99 })));
    expect(rows[0].collectedCommission).toBe(0.37);
    const half = computeCommissions([rule({ basis: "PERCENT_COLLECTED", rate: 10 })], [fact({ kind: "payment", userId: "x", amountSen: 5 })]);
    expect(half[0].collectedCommission).toBe(0.01);
  });

  it("splits by the rule in force on each date", () => {
    const rules = [
      rule({ basis: "PERCENT_COLLECTED", rate: 10, doctorId: "dr-a" }),
      rule({ basis: "PERCENT_COLLECTED", rate: 20, doctorId: "dr-a", effectiveFrom: new Date("2026-06-15T00:00:00.000Z") }),
    ];
    const rows = computeCommissions(rules, [
      fact({ kind: "payment", userId: "dr-a", amountSen: 10000, at: at("2026-06-01") }),
      fact({ kind: "payment", userId: "dr-a", amountSen: 10000, at: at("2026-06-20") }),
    ]);
    expect(rows[0].collectedCommission).toBe(30);
  });

  it("lists staff with activity but no rule at zero", () => {
    const rows = computeCommissions([], [fact({ kind: "payment", userId: "dr-z", amountSen: 5000 })]);
    expect(rows).toEqual([
      { userId: "dr-z", collected: 50, collectedCommission: 0, visits: 0, visitCommission: 0, packageSales: 0, packageCommission: 0, total: 0 },
    ]);
  });

  it("describes rates", () => {
    expect(describeRate("PERCENT_COLLECTED", 10)).toBe("10%");
    expect(describeRate("PERCENT_PACKAGE_SALE", 12.5)).toBe("12.5%");
    expect(describeRate("FIXED_PER_VISIT", 40)).toBe("RM 40.00 per visit");
  });
});
