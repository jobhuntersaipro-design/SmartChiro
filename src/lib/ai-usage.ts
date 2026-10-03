import { prisma } from "@/lib/prisma";
import { clinicDayBounds, clinicDateKey } from "@/lib/clinic-time";
import type { AiUsageToday } from "@/types/pelvis";

/**
 * Daily AI limit: each user may run AI pelvis analysis on `User.aiDailyLimit`
 * different X-rays per clinic day (default 10; super admins change it).
 * Re-running an X-ray already analysed today doesn't count again; analyses
 * that don't place landmarks (rejected film, error) don't count.
 */

export interface DailyUsage {
  /** X-rays analysed so far today. */
  xrayIds: Set<string>;
  limit: number;
}

export async function aiUsageToday(userId: string, now: Date = new Date()): Promise<DailyUsage> {
  const { start } = clinicDayBounds(clinicDateKey(now));
  const [user, rows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { aiDailyLimit: true } }),
    prisma.aiUsage.findMany({
      where: { userId, createdAt: { gte: start } },
      select: { xrayId: true },
      distinct: ["xrayId"],
    }),
  ]);
  return { xrayIds: new Set(rows.map((r) => r.xrayId)), limit: user?.aiDailyLimit ?? 0 };
}

export function dailyLimitReached(usage: DailyUsage, xrayId: string): boolean {
  return !usage.xrayIds.has(xrayId) && usage.xrayIds.size >= usage.limit;
}

/**
 * Claim this X-ray's place in today's limit before the analysis runs (it takes
 * 25-45 s), then count again, so parallel requests can't slip past the limit.
 * Null when that pushed the user over: the claim is withdrawn. Release the
 * claim if the analysis doesn't place landmarks.
 */
export async function reserveAiUsage(
  userId: string,
  xrayId: string,
  now: Date = new Date(),
): Promise<{ id: string; usage: AiUsageToday } | null> {
  const claim = await prisma.aiUsage.create({ data: { userId, xrayId } });
  const usage = await aiUsageToday(userId, now);
  if (usage.xrayIds.size > usage.limit) {
    await releaseAiUsage(claim.id);
    return null;
  }
  return { id: claim.id, usage: { used: usage.xrayIds.size, limit: usage.limit } };
}

export async function releaseAiUsage(claimId: string): Promise<void> {
  await prisma.aiUsage.deleteMany({ where: { id: claimId } });
}

/** Distinct X-rays analysed today, per user: for the super admin list. */
export async function aiUsageCountsToday(userIds: string[], now: Date = new Date()): Promise<Map<string, number>> {
  const { start } = clinicDayBounds(clinicDateKey(now));
  const rows = await prisma.aiUsage.findMany({
    where: { userId: { in: userIds }, createdAt: { gte: start } },
    select: { userId: true, xrayId: true },
    distinct: ["userId", "xrayId"],
  });
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.userId, (counts.get(r.userId) ?? 0) + 1);
  return counts;
}
