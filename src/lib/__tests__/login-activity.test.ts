import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { activityStale, recordActivity, recordSignIn } from "../login-activity";

const PREFIX = `test-login-activity-${Date.now()}`;
const T = new Date("2026-10-04T02:00:00Z");

describe("login activity", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  });

  it("counts sign-ins by id, or by email (any case) for Google sign-ins", async () => {
    const u = await prisma.user.create({ data: { email: `${PREFIX}-a@t.com` } });
    await recordSignIn({ id: u.id, email: u.email }, T);
    await recordSignIn({ id: "google-sub-123", email: u.email.toUpperCase() }, new Date(T.getTime() + 60_000));
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.loginCount).toBe(2);
    expect(row.lastLoginAt?.toISOString()).toBe("2026-10-04T02:01:00.000Z");
    expect(row.lastActiveAt?.toISOString()).toBe("2026-10-04T02:01:00.000Z");
  });

  it("never throws, even for an unknown user", async () => {
    await expect(recordSignIn({ id: null, email: null })).resolves.toBeUndefined();
    await expect(recordActivity("no-such-user")).resolves.toBeUndefined();
  });

  it("writes last active at most once an hour", async () => {
    expect(activityStale(null, T)).toBe(true);
    expect(activityStale(new Date(T.getTime() - 59 * 60_000), T)).toBe(false);
    expect(activityStale(new Date(T.getTime() - 60 * 60_000), T)).toBe(true);
    const u = await prisma.user.create({ data: { email: `${PREFIX}-b@t.com` } });
    await recordActivity(u.id, T);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).lastActiveAt?.toISOString()).toBe(T.toISOString());
  });
});
