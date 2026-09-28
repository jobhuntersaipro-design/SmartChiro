import type { CommissionBasis } from "@prisma/client";

/**
 * Commission rules (pure, client-safe).
 *
 * Two streams are paid independently:
 * - treatment work — PERCENT_COLLECTED (share of payments collected on the
 *   doctor's appointments) or FIXED_PER_VISIT (MYR per completed visit). For
 *   a doctor, treatment and date exactly one of these rules applies: the most
 *   specific one, so a doctor-specific "RM 40 per visit" replaces an
 *   all-doctors "30% of collections" for that doctor;
 * - package sales — PERCENT_PACKAGE_SALE, a share of money collected on the
 *   package-sale invoices a staff member sold. Matched on staff only.
 *
 * Specificity: doctor + treatment > doctor > treatment > all. Among equally
 * specific rules the latest effective date (on or before the event) wins,
 * so a new rate is a new rule with a later effective date.
 */

export const COMMISSION_BASES = ["PERCENT_COLLECTED", "FIXED_PER_VISIT", "PERCENT_PACKAGE_SALE"] as const satisfies readonly CommissionBasis[];

export const COMMISSION_BASIS_LABEL: Record<CommissionBasis, string> = {
  PERCENT_COLLECTED: "% of payments collected",
  FIXED_PER_VISIT: "Fixed per completed visit",
  PERCENT_PACKAGE_SALE: "% of package sales",
};

export type CommissionStream = "service" | "package";

export function streamOf(basis: CommissionBasis): CommissionStream {
  return basis === "PERCENT_PACKAGE_SALE" ? "package" : "service";
}

export function isPercentBasis(basis: CommissionBasis): boolean {
  return basis !== "FIXED_PER_VISIT";
}

export interface CommissionRuleLike {
  id: string;
  branchId: string;
  doctorId: string | null;
  treatmentType: string | null;
  basis: CommissionBasis;
  /** Percent for PERCENT_* bases, MYR for FIXED_PER_VISIT. */
  rate: number;
  effectiveFrom: Date;
  active: boolean;
  createdAt?: Date;
}

export interface RuleQuery {
  stream: CommissionStream;
  branchId: string;
  userId: string;
  treatmentType: string | null;
  at: Date;
}

export function ruleSpecificity(rule: Pick<CommissionRuleLike, "doctorId" | "treatmentType">): number {
  return (rule.doctorId ? 2 : 0) + (rule.treatmentType ? 1 : 0);
}

/** The rule that applies to one event, or null when none does. */
export function resolveRule<R extends CommissionRuleLike>(rules: R[], q: RuleQuery): R | null {
  let best: R | null = null;
  for (const r of rules) {
    if (!r.active || r.branchId !== q.branchId || streamOf(r.basis) !== q.stream) continue;
    if (r.effectiveFrom.getTime() > q.at.getTime()) continue;
    if (r.doctorId && r.doctorId !== q.userId) continue;
    if (r.treatmentType && r.treatmentType !== q.treatmentType) continue;
    if (!best) {
      best = r;
      continue;
    }
    const diff = ruleSpecificity(r) - ruleSpecificity(best);
    const newer =
      r.effectiveFrom.getTime() - best.effectiveFrom.getTime() ||
      (r.createdAt?.getTime() ?? 0) - (best.createdAt?.getTime() ?? 0);
    if (diff > 0 || (diff === 0 && newer > 0)) best = r;
  }
  return best;
}

// ─── Computation ───

/**
 * One commissionable event.
 * - "payment": a payment (negative = refund) on an appointment invoice —
 *   `userId` is the appointment's doctor, `amountSen` the money.
 * - "visit": a completed visit — `amountSen` ignored.
 * - "package": a payment on a package-sale invoice — `userId` is the seller.
 */
export interface CommissionFact {
  kind: "payment" | "visit" | "package";
  branchId: string;
  userId: string;
  treatmentType: string | null;
  at: Date;
  amountSen: number;
}

export interface CommissionRow {
  userId: string;
  /** Payments collected on the doctor's appointments (net of refunds), MYR. */
  collected: number;
  collectedCommission: number;
  visits: number;
  visitCommission: number;
  /** Package sales collected, MYR. */
  packageSales: number;
  packageCommission: number;
  total: number;
}

interface Acc {
  collectedSen: number;
  visits: number;
  packageSen: number;
  /** Basis per rule, so each rate is applied once to its sum (no per-payment rounding drift). */
  byRule: Map<string, { basis: CommissionBasis; rate: number; sen: number; visits: number }>;
}

/** Half-up to the sen for positives, symmetric for refunds. */
function percentOf(sen: number, rate: number): number {
  const rateBp = Math.round(rate * 100);
  const sign = sen < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(sen) * rateBp + 5000) / 10000);
}

export function computeCommissions(rules: CommissionRuleLike[], facts: CommissionFact[]): CommissionRow[] {
  const people = new Map<string, Acc>();
  for (const f of facts) {
    const acc = people.get(f.userId) ?? { collectedSen: 0, visits: 0, packageSen: 0, byRule: new Map() };
    people.set(f.userId, acc);
    if (f.kind === "payment") acc.collectedSen += f.amountSen;
    else if (f.kind === "visit") acc.visits += 1;
    else acc.packageSen += f.amountSen;

    const rule = resolveRule(rules, {
      stream: f.kind === "package" ? "package" : "service",
      branchId: f.branchId,
      userId: f.userId,
      treatmentType: f.kind === "package" ? null : f.treatmentType,
      at: f.at,
    });
    if (!rule) continue;
    // A payment only earns under a % rule, a visit only under a fixed rule.
    if (f.kind === "payment" && rule.basis !== "PERCENT_COLLECTED") continue;
    if (f.kind === "visit" && rule.basis !== "FIXED_PER_VISIT") continue;
    const slot = acc.byRule.get(rule.id) ?? { basis: rule.basis, rate: rule.rate, sen: 0, visits: 0 };
    if (f.kind === "visit") slot.visits += 1;
    else slot.sen += f.amountSen;
    acc.byRule.set(rule.id, slot);
  }

  const rows: CommissionRow[] = [];
  for (const [userId, acc] of people) {
    let collectedSen = 0;
    let visitSen = 0;
    let packageSen = 0;
    for (const slot of acc.byRule.values()) {
      if (slot.basis === "FIXED_PER_VISIT") visitSen += slot.visits * Math.round(slot.rate * 100);
      else if (slot.basis === "PERCENT_COLLECTED") collectedSen += percentOf(slot.sen, slot.rate);
      else packageSen += percentOf(slot.sen, slot.rate);
    }
    rows.push({
      userId,
      collected: acc.collectedSen / 100,
      collectedCommission: collectedSen / 100,
      visits: acc.visits,
      visitCommission: visitSen / 100,
      packageSales: acc.packageSen / 100,
      packageCommission: packageSen / 100,
      total: (collectedSen + visitSen + packageSen) / 100,
    });
  }
  return rows.sort((a, b) => b.total - a.total || b.collected - a.collected);
}

export function commissionTotals(rows: CommissionRow[]): Omit<CommissionRow, "userId"> {
  const sum = (pick: (r: CommissionRow) => number) => Math.round(rows.reduce((s, r) => s + pick(r) * 100, 0)) / 100;
  return {
    collected: sum((r) => r.collected),
    collectedCommission: sum((r) => r.collectedCommission),
    visits: rows.reduce((s, r) => s + r.visits, 0),
    visitCommission: sum((r) => r.visitCommission),
    packageSales: sum((r) => r.packageSales),
    packageCommission: sum((r) => r.packageCommission),
    total: sum((r) => r.total),
  };
}

/** "10%" / "RM 40.00 per visit" */
export function describeRate(basis: CommissionBasis, rate: number): string {
  if (isPercentBasis(basis)) return `${Number(rate.toFixed(2))}%`;
  return `RM ${rate.toFixed(2)} per visit`;
}
