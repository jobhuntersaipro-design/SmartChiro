import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { loadBranchContext } from "@/lib/branch-context";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseRange, type ReportRange } from "@/lib/reports/range";
import type { ReportRangeJson, ReportScopeJson } from "@/types/reports";

export interface ReportRequest {
  userId: string;
  range: ReportRange;
  branchIds: string[];
  branchNames: Map<string, string>;
  scope: ReportScopeJson;
  rangeJson: ReportRangeJson;
  now: Date;
}

const error = (status: number, code: string, message: string) =>
  NextResponse.json({ error: code, message }, { status });

/**
 * Shared front half of every /api/reports/* route: session, `reports.read`
 * scope and the date range.
 *
 * `?branchId=all` covers every branch where the caller may read reports
 * (403 when there are none); a single branch must be one the caller belongs
 * to (404 otherwise, so other clinics' ids don't leak) with `reports.read`
 * (403). Without `branchId` the sidebar scope applies. `?from=&to=` are clinic
 * days, `to` inclusive, default this month.
 */
export async function resolveReportRequest(req: Request): Promise<ReportRequest | NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return error(401, "unauthorized", "Sign in to view reports.");

  const url = new URL(req.url);
  const context = await loadBranchContext(userId);
  const param = url.searchParams.get("branchId") || (context.allBranches ? "all" : context.activeBranchId);
  if (!param) return error(404, "not_found", "No branch selected.");

  let branchIds: string[];
  if (param === "all") {
    branchIds = context.branches.filter((b) => can(b.role, "reports.read")).map((b) => b.id);
    if (branchIds.length === 0) return error(403, "forbidden", "Reports are for branch owners and admins.");
  } else {
    const role = context.roles[param];
    if (!role) return error(404, "not_found", "Branch not found.");
    if (!can(role, "reports.read")) return error(403, "forbidden", "Reports are for branch owners and admins.");
    branchIds = [param];
  }

  const now = new Date();
  const parsed = parseRange(url.searchParams.get("from"), url.searchParams.get("to"), now);
  if (!parsed.ok) return error(400, parsed.error, parsed.message);

  const branchNames = new Map(context.branches.filter((b) => branchIds.includes(b.id)).map((b) => [b.id, b.name]));
  return {
    userId,
    range: parsed.range,
    branchIds,
    branchNames,
    scope: {
      branchIds,
      label: param === "all" ? "All branches" : branchNames.get(param) ?? "Branch",
    },
    rangeJson: { from: parsed.range.from, to: parsed.range.to, days: parsed.range.days },
    now,
  };
}

/** `IN (...)` list for raw SQL (callers guarantee at least one id). */
export function sqlIn(ids: string[]): Prisma.Sql {
  return Prisma.join(ids);
}

/** Display names for user ids (doctors). */
export async function userNames(ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}
