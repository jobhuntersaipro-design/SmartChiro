import { prisma } from "@/lib/prisma";
import { clinicDayBounds, clinicDateKey } from "@/lib/clinic-time";
import type { AiUsageToday } from "@/types/pelvis";

/**
 * Daily AI limit: each user may run AI pelvis analysis on `User.aiDailyLimit`
 * different X-rays per clinic day (default 10; super admins change it).
 * Re-running an X-ray already analysed today doesn't count again.
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

/** Record a finished analysis; returns today's count with it. */
export async function recordAiUsage(userId: string, xrayId: string, usage: DailyUsage): Promise<AiUsageToday> {
  await prisma.aiUsage.create({ data: { userId, xrayId } });
  return { used: usage.xrayIds.size + (usage.xrayIds.has(xrayId) ? 0 : 1), limit: usage.limit };
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
