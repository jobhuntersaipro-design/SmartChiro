import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadBranchContext } from "@/lib/branch-context";
import { can } from "@/lib/permissions";
import { CLINICIAN_ROLES } from "@/lib/clinician";
import { clinicDateKey } from "@/lib/clinic-time";
import { addDaysToKey } from "@/lib/reports/range";
import { daysUntilExpiry, expiryInstant, expiryKey, stageForDays } from "@/lib/certificates";
import type { CertificateAlertRow, CertificateAlertsResponse } from "@/types/certificates";

/** How far ahead the dashboard looks (the first alert threshold). */
const LOOKAHEAD_DAYS = 60;

const error = (status: number, code: string) => NextResponse.json({ error: code }, { status });

/**
 * Clinicians (DOCTOR / OWNER members) in scope whose Annual Practising
 * Certificate has expired or expires within 60 days, soonest first.
 * OWNER / ADMIN only. `?branchId=all` = every branch the caller manages;
 * one branch must be a membership (404) the caller manages (403). Without
 * it the sidebar scope applies.
 */
export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return error(401, "unauthorized");

  const context = await loadBranchContext(userId);
  const param = new URL(req.url).searchParams.get("branchId") || (context.allBranches ? "all" : context.activeBranchId);
  if (!param) return error(404, "not_found");

  let branchIds: string[];
  if (param === "all") {
    branchIds = context.branches.filter((b) => can(b.role, "staff.manage")).map((b) => b.id);
    if (branchIds.length === 0) return error(403, "forbidden");
  } else {
    const role = context.roles[param];
    if (!role) return error(404, "not_found");
    if (!can(role, "staff.manage")) return error(403, "forbidden");
    branchIds = [param];
  }

  const now = new Date();
  const horizon = expiryInstant(addDaysToKey(clinicDateKey(now), LOOKAHEAD_DAYS));
  const members = await prisma.branchMember.findMany({
    where: {
      branchId: { in: branchIds },
      role: { in: CLINICIAN_ROLES },
      user: { doctorProfile: { apcExpiresAt: { not: null, lte: horizon } } },
    },
    orderBy: { createdAt: "asc" },
    select: {
      branch: { select: { name: true } },
      user: {
        select: {
          id: true,
          name: true,
          doctorProfile: { select: { tcmRegistrationNo: true, apcNumber: true, apcExpiresAt: true } },
        },
      },
    },
  });

  const rows = new Map<string, CertificateAlertRow>();
  for (const m of members) {
    const profile = m.user.doctorProfile;
    if (!profile?.apcExpiresAt) continue;
    const existing = rows.get(m.user.id);
    if (existing) {
      existing.branches.push(m.branch.name);
      continue;
    }
    const expiresOn = expiryKey(profile.apcExpiresAt);
    const daysLeft = daysUntilExpiry(expiresOn, now);
    const stage = stageForDays(daysLeft);
    if (stage === "ok") continue;
    rows.set(m.user.id, {
      userId: m.user.id,
      name: m.user.name,
      tcmRegistrationNo: profile.tcmRegistrationNo,
      apcNumber: profile.apcNumber,
      expiresOn,
      daysLeft,
      stage,
      branches: [m.branch.name],
    });
  }

  const body: CertificateAlertsResponse = {
    certificates: [...rows.values()].sort(
      (a, b) => a.daysLeft - b.daysLeft || (a.name ?? "").localeCompare(b.name ?? ""),
    ),
  };
  return NextResponse.json(body);
}
