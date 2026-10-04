import { prisma } from "@/lib/prisma";

/**
 * Login activity for the super admin page: sign-ins (count + last) and the
 * last dashboard visit. Best effort — never blocks signing in or a page.
 */

const ACTIVE_WRITE_EVERY_MS = 60 * 60 * 1000;

/** A successful sign-in, email or Google (Google users may only carry their email here). */
export async function recordSignIn(user: { id?: string | null; email?: string | null }, now: Date = new Date()) {
  try {
    await prisma.user.updateMany({
      where: {
        OR: [{ id: user.id ?? "" }, { email: { equals: user.email ?? "", mode: "insensitive" } }],
      },
      data: { lastLoginAt: now, lastActiveAt: now, loginCount: { increment: 1 } },
    });
  } catch (err) {
    console.error("[auth] login activity not recorded:", err);
  }
}

/** Sessions last weeks, so "last active" comes from dashboard visits, written at most once an hour. */
export function activityStale(lastActiveAt: Date | null, now: Date = new Date()): boolean {
  return !lastActiveAt || now.getTime() - lastActiveAt.getTime() >= ACTIVE_WRITE_EVERY_MS;
}

export async function recordActivity(userId: string, now: Date = new Date()) {
  try {
    await prisma.user.update({ where: { id: userId }, data: { lastActiveAt: now } });
  } catch (err) {
    console.error("[auth] last active not recorded:", err);
  }
}
