import type { AttributionKind, DoctorRevenueRow, RevenueRow } from "@/types/reports";
import { TREATMENT_LABELS } from "@/lib/treatment-colors";
import { displayDoctorName } from "@/lib/format";

/**
 * Revenue attribution (pure). Each fact is money in sen for one clinic day
 * and one invoice origin: the appointment it was issued for (its doctor and
 * treatment), a package sale, or neither (a manual invoice).
 */
export interface RevenueFact {
  day: string;
  branchId: string;
  /** The invoice's appointment doctor, or null without an appointment. */
  doctorId: string | null;
  treatmentType: string | null;
  /** The invoice sold a prepaid package. */
  isPackageSale: boolean;
  collectedSen: number;
  invoicedSen: number;
}

export const NO_APPOINTMENT_LABEL = "No appointment";
export const PACKAGE_SALES_LABEL = "Package sales";
export const UNSPECIFIED_TREATMENT_LABEL = "Treatment not set";

/**
 * Who a sale counts toward. A package sale is "Package sales" (sessions are
 * delivered later, by whoever treats); otherwise the appointment's doctor;
 * an invoice with neither is "No appointment".
 */
export function attributeDoctor(fact: Pick<RevenueFact, "doctorId" | "isPackageSale">): { kind: AttributionKind; key: string } {
  if (fact.isPackageSale) return { kind: "package_sales", key: "package_sales" };
  if (fact.doctorId) return { kind: "doctor", key: fact.doctorId };
  return { kind: "no_appointment", key: "no_appointment" };
}

/** Treatment bucket: package sales and manual invoices get the same fixed rows as the doctor split. */
export function attributeTreatment(fact: Pick<RevenueFact, "doctorId" | "treatmentType" | "isPackageSale">): { key: string; name: string } {
  const who = attributeDoctor(fact);
  if (who.kind === "package_sales") return { key: who.key, name: PACKAGE_SALES_LABEL };
  if (who.kind === "no_appointment") return { key: who.key, name: NO_APPOINTMENT_LABEL };
  if (!fact.treatmentType) return { key: "unspecified", name: UNSPECIFIED_TREATMENT_LABEL };
  const label = TREATMENT_LABELS[fact.treatmentType as keyof typeof TREATMENT_LABELS];
  return { key: fact.treatmentType, name: label ?? fact.treatmentType };
}

interface Acc {
  collected: number;
  invoiced: number;
}

function add(map: Map<string, Acc>, key: string, fact: RevenueFact) {
  const acc = map.get(key) ?? { collected: 0, invoiced: 0 };
  acc.collected += fact.collectedSen;
  acc.invoiced += fact.invoicedSen;
  map.set(key, acc);
}

/** Largest collected first, then invoiced, then name — fixed rows sort like any other. */
function sortRows<T extends RevenueRow>(rows: T[]): T[] {
  return rows.sort((a, b) => b.collected - a.collected || b.invoiced - a.invoiced || a.name.localeCompare(b.name));
}

const toRow = (key: string, name: string, acc: Acc): RevenueRow => ({
  key,
  name,
  collected: acc.collected / 100,
  invoiced: acc.invoiced / 100,
});

export interface RevenueSplits {
  totals: { collected: number; invoiced: number };
  byBranch: RevenueRow[];
  byDoctor: DoctorRevenueRow[];
  byTreatment: RevenueRow[];
}

/**
 * Totals and the three splits. Every split sums to the totals (to the sen).
 * `branchIds` lists branches that always get a row (zero when idle).
 */
export function splitRevenue(
  facts: RevenueFact[],
  names: { branches: Map<string, string>; doctors: Map<string, string | null> },
  branchIds: string[] = [],
): RevenueSplits {
  const branches = new Map<string, Acc>(branchIds.map((id) => [id, { collected: 0, invoiced: 0 }]));
  const doctors = new Map<string, Acc>();
  const kinds = new Map<string, AttributionKind>();
  const treatments = new Map<string, Acc>();
  const treatmentNames = new Map<string, string>();
  const total: Acc = { collected: 0, invoiced: 0 };

  for (const f of facts) {
    total.collected += f.collectedSen;
    total.invoiced += f.invoicedSen;
    add(branches, f.branchId, f);
    const who = attributeDoctor(f);
    kinds.set(who.key, who.kind);
    add(doctors, who.key, f);
    const t = attributeTreatment(f);
    treatmentNames.set(t.key, t.name);
    add(treatments, t.key, f);
  }

  const doctorName = (key: string, kind: AttributionKind) =>
    kind === "package_sales"
      ? PACKAGE_SALES_LABEL
      : kind === "no_appointment"
        ? NO_APPOINTMENT_LABEL
        : displayDoctorName(names.doctors.get(key));

  return {
    totals: { collected: total.collected / 100, invoiced: total.invoiced / 100 },
    byBranch: sortRows([...branches].map(([id, acc]) => toRow(id, names.branches.get(id) ?? "Unknown branch", acc))),
    byDoctor: sortRows(
      [...doctors].map(([key, acc]) => {
        const kind = kinds.get(key)!;
        return { ...toRow(key, doctorName(key, kind), acc), kind };
      }),
    ),
    byTreatment: sortRows([...treatments].map(([key, acc]) => toRow(key, treatmentNames.get(key)!, acc))),
  };
}
