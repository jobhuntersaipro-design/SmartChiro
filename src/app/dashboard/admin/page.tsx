import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accountAccess, isSuperAdminEmail } from "@/lib/subscription";
import { planState, trialDaysLeft } from "@/lib/plans";
import { aiUsageCountsToday } from "@/lib/ai-usage";
import { clinicDateLabel, clinicTimeLabel } from "@/lib/clinic-time";
import { formatRelativeTime } from "@/components/dashboard/branches/audit-log-format";
import { SuperAdminView, type AdminUserRow } from "@/components/admin/SuperAdminView";

export const metadata = { title: "Super admin — SmartChiro" };

/** Everyone who signed up: plan, login activity, X-ray and AI usage. Super admins only (SUPER_ADMIN_EMAILS). */
export default async function SuperAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperAdminEmail(session.user.email)) notFound();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      emailVerified: true,
      trialEndsAt: true,
      subscriptionStatus: true,
      subscriptionInterval: true,
      subscriptionPeriodEnd: true,
      aiDailyLimit: true,
      disabledAt: true,
      lastLoginAt: true,
      loginCount: true,
      lastActiveAt: true,
      branchMemberships: { select: { role: true, branch: { select: { name: true } } } },
    },
  });
  const ids = users.map((u) => u.id);
  const now = new Date();
  const [usage, ai30, uploads, access] = await Promise.all([
    aiUsageCountsToday(ids),
    prisma.aiUsage.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
      _count: { _all: true },
    }),
    prisma.xray.groupBy({ by: ["uploadedById"], where: { uploadedById: { in: ids } }, _count: { _all: true } }),
    // What each account can actually do: staff are covered by their clinic's plan.
    Promise.all(ids.map((id) => accountAccess(id, now))),
  ]);
  const accessByUser = new Map(ids.map((id, i) => [id, access[i]]));
  const ai30ByUser = new Map(ai30.map((r) => [r.userId, r._count._all]));
  const uploadsByUser = new Map(uploads.map((r) => [r.uploadedById, r._count._all]));

  const rows: AdminUserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    signedUp: clinicDateLabel(u.createdAt),
    newThisWeek: now.getTime() - u.createdAt.getTime() < 7 * 86_400_000,
    verified: u.emailVerified != null,
    state: accessByUser.get(u.id)?.state ?? planState(u, now),
    staffOnly: accessByUser.get(u.id)?.staffOnly ?? false,
    coveredBy: accessByUser.get(u.id)?.coveredBy?.name ?? accessByUser.get(u.id)?.coveredBy?.email ?? null,
    trialDaysLeft: trialDaysLeft(u.trialEndsAt, now),
    trialEndsAt: u.trialEndsAt?.toISOString() ?? null,
    trialEndsLabel: u.trialEndsAt ? clinicDateLabel(u.trialEndsAt) : null,
    subscriptionStatus: u.subscriptionStatus,
    subscriptionInterval: u.subscriptionInterval,
    renewsLabel: u.subscriptionPeriodEnd ? clinicDateLabel(u.subscriptionPeriodEnd) : null,
    lastActiveLabel: u.lastActiveAt ? formatRelativeTime(u.lastActiveAt.toISOString(), now) : null,
    activeThisWeek: u.lastActiveAt != null && now.getTime() - u.lastActiveAt.getTime() < 7 * 86_400_000,
    lastLoginLabel: u.lastLoginAt ? `${clinicDateLabel(u.lastLoginAt)}, ${clinicTimeLabel(u.lastLoginAt)}` : null,
    loginCount: u.loginCount,
    aiToday: usage.get(u.id) ?? 0,
    ai30Days: ai30ByUser.get(u.id) ?? 0,
    xraysUploaded: uploadsByUser.get(u.id) ?? 0,
    aiDailyLimit: u.aiDailyLimit,
    disabled: u.disabledAt != null,
    clinics: u.branchMemberships.map((m) => ({ name: m.branch.name, role: m.role })),
    isSelf: u.id === session.user.id,
  }));

  return <SuperAdminView rows={rows} />;
}
