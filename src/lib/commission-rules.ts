import { z } from "zod";
import { CommissionBasis, TreatmentType, type CommissionRule } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { can } from "@/lib/permissions";
import { clinicDateKey, clinicDayBounds } from "@/lib/clinic-time";
import { isIsoDate } from "@/lib/date-input";
import { isPercentBasis } from "@/lib/commissions";
import type { CommissionRuleJson } from "@/types/commissions";

/** Server helpers for /api/branches/[branchId]/commission-rules. */

const MAX_FIXED_RATE = 99_999.99;

const twoDecimals = (v: number) => Math.round(v * 100) === Number((v * 100).toFixed(6));

const Fields = {
  doctorId: z.string().min(1).nullable(),
  treatmentType: z.enum(TreatmentType).nullable(),
  basis: z.enum(CommissionBasis),
  rate: z.number().gt(0, "must be more than 0").max(MAX_FIXED_RATE).refine(twoDecimals, "at most 2 decimals"),
  effectiveFrom: z.string().refine(isIsoDate, "must be a date (YYYY-MM-DD)"),
  active: z.boolean(),
};

export const CreateRuleSchema = z
  .object({
    doctorId: Fields.doctorId.default(null),
    treatmentType: Fields.treatmentType.default(null),
    basis: Fields.basis,
    rate: Fields.rate,
    effectiveFrom: Fields.effectiveFrom,
    active: Fields.active.default(true),
  })
  .strict();

export const UpdateRuleSchema = z
  .object({
    doctorId: Fields.doctorId,
    treatmentType: Fields.treatmentType,
    basis: Fields.basis,
    rate: Fields.rate,
    effectiveFrom: Fields.effectiveFrom,
    active: Fields.active,
  })
  .partial()
  .strict();

export interface RuleShape {
  basis: CommissionBasis;
  rate: number;
  treatmentType: TreatmentType | null;
}

/** Cross-field checks after merging an update with the stored rule. */
export function ruleProblem(rule: RuleShape): string | null {
  if (isPercentBasis(rule.basis) && rule.rate > 100) return "A percentage rate must be at most 100.";
  if (rule.basis === "PERCENT_PACKAGE_SALE" && rule.treatmentType) {
    return "Package-sale commission applies to every package — leave the treatment as All.";
  }
  return null;
}

/** The effective-from clinic day as the instant its day starts (Asia/Kuala_Lumpur). */
export const effectiveInstant = (key: string): Date => clinicDayBounds(key).start;

export function serializeRule(rule: CommissionRule, names: Map<string, string | null>): CommissionRuleJson {
  return {
    id: rule.id,
    branchId: rule.branchId,
    doctorId: rule.doctorId,
    doctorName: rule.doctorId ? (names.get(rule.doctorId) ?? null) : null,
    treatmentType: rule.treatmentType,
    basis: rule.basis,
    rate: Number(rule.rate),
    effectiveFrom: clinicDateKey(rule.effectiveFrom),
    active: rule.active,
    createdAt: rule.createdAt.toISOString(),
  };
}

const fail = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

/** Session + membership (404) + `commissions.manage` (403). */
export async function requireCommissionManager(branchId: string): Promise<{ userId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user?.id) return fail(401, "unauthorized", "Sign in required.");
  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return fail(404, "not_found", "Branch not found.");
  if (!can(role, "commissions.manage")) return fail(403, "forbidden", "Only owners and admins manage commissions.");
  return { userId: user.id };
}

export const validationError = (message: string, details?: unknown) =>
  NextResponse.json({ error: "validation", message, details }, { status: 422 });
