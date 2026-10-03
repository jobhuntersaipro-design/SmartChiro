import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/subscription";
import { planState, trialDaysLeft } from "@/lib/plans";
import { aiUsageCountsToday } from "@/lib/ai-usage";
import { clinicDateLabel } from "@/lib/clinic-time";
import { SuperAdminView, type AdminUserRow } from "@/components/admin/SuperAdminView";

export const metadata = { title: "Super admin — SmartChiro" };

/** Everyone who signed up: plan, AI usage today and limits. Super admins only (SUPER_ADMIN_EMAILS). */
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
      branchMemberships: { select: { role: true, branch: { select: { name: true } } } },
    },
  });
  const usage = await aiUsageCountsToday(users.map((u) => u.id));
  const now = new Date();

  const rows: AdminUserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    signedUp: clinicDateLabel(u.createdAt),
    newThisWeek: now.getTime() - u.createdAt.getTime() < 7 * 86_400_000,
    verified: u.emailVerified != null,
    state: planState(u, now),
    trialDaysLeft: trialDaysLeft(u.trialEndsAt, now),
    trialEndsAt: u.trialEndsAt?.toISOString() ?? null,
    trialEndsLabel: u.trialEndsAt ? clinicDateLabel(u.trialEndsAt) : null,
    subscriptionStatus: u.subscriptionStatus,
    subscriptionInterval: u.subscriptionInterval,
    renewsLabel: u.subscriptionPeriodEnd ? clinicDateLabel(u.subscriptionPeriodEnd) : null,
    aiToday: usage.get(u.id) ?? 0,
    aiDailyLimit: u.aiDailyLimit,
    disabled: u.disabledAt != null,
    clinics: u.branchMemberships.map((m) => ({ name: m.branch.name, role: m.role })),
    isSelf: u.id === session.user.id,
  }));

  return <SuperAdminView rows={rows} />;
}
