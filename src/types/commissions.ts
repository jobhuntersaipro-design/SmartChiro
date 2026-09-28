import type { BranchRole, CommissionBasis, TreatmentType } from "@prisma/client";
import type { ReportRangeJson, ReportScopeJson } from "@/types/reports";

export interface CommissionRuleJson {
  id: string;
  branchId: string;
  /** null = all doctors / staff. */
  doctorId: string | null;
  doctorName: string | null;
  /** null = all treatments. */
  treatmentType: TreatmentType | null;
  basis: CommissionBasis;
  rate: number;
  /** Clinic day "YYYY-MM-DD". */
  effectiveFrom: string;
  active: boolean;
  createdAt: string;
}

export interface CommissionStaffOption {
  id: string;
  name: string | null;
  role: BranchRole;
}

export interface CommissionRulesResponse {
  rules: CommissionRuleJson[];
  staff: CommissionStaffOption[];
}

/** One doctor / seller in the commissions report. Money in MYR. */
export interface CommissionReportRow {
  userId: string;
  name: string;
  collected: number;
  collectedCommission: number;
  visits: number;
  visitCommission: number;
  packageSales: number;
  packageCommission: number;
  total: number;
}

export interface CommissionsReport {
  range: ReportRangeJson;
  scope: ReportScopeJson;
  rows: CommissionReportRow[];
  totals: Omit<CommissionReportRow, "userId" | "name">;
  /** Active rules in the scope's branches (0 = nothing configured yet). */
  ruleCount: number;
}
