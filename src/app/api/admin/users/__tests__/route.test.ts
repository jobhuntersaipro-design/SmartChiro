import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

const PREFIX = `test-admin-users-${Date.now()}`;
const ADMIN_EMAIL = `${PREFIX}-admin@t.com`;
let adminId: string;
let userId: string;

function patch(id: string, body: unknown) {
  return [
    new NextRequest(`http://localhost:3000/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ userId: id }) },
  ] as const;
}

describe("PATCH /api/admin/users/[userId]", () => {
  beforeAll(async () => {
    adminId = (await prisma.user.create({ data: { email: ADMIN_EMAIL } })).id;
    userId = (await prisma.user.create({ data: { email: `${PREFIX}-doctor@t.com` } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  });
  beforeEach(() => {
    vi.stubEnv("SUPER_ADMIN_EMAILS", ADMIN_EMAIL);
    mockAuth.mockResolvedValue({ user: { id: adminId, email: ADMIN_EMAIL } });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("gives new accounts a 30-day trial and a limit of 10 AI X-rays a day", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.aiDailyLimit).toBe(10);
    const days = (user.trialEndsAt!.getTime() - user.createdAt.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(30, 1);
  });

  it("is a 404 for anyone who isn't a super admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId, email: `${PREFIX}-doctor@t.com` } });
    const { PATCH } = await import("../[userId]/route");
    expect((await PATCH(...patch(userId, { aiDailyLimit: 50 }))).status).toBe(404);
    mockAuth.mockResolvedValue(null);
    expect((await PATCH(...patch(userId, { aiDailyLimit: 50 }))).status).toBe(404);
  });

  it("changes the daily AI limit, the trial end and disables the account", async () => {
    const { PATCH } = await import("../[userId]/route");
    const trialEndsAt = "2026-12-31T15:59:59.999Z";
    const res = await PATCH(...patch(userId, { aiDailyLimit: 25, trialEndsAt, disabled: true }));
    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.aiDailyLimit).toBe(25);
    expect(user.trialEndsAt?.toISOString()).toBe(trialEndsAt);
    expect(user.disabledAt).not.toBeNull();

    await PATCH(...patch(userId, { disabled: false }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).disabledAt).toBeNull();
  });

  it("a super admin's clinic covers its staff even after the super admin's own trial ends", async () => {
    const { accountAccess } = await import("@/lib/subscription");
    const past = new Date(Date.now() - 86_400_000);
    const branch = await prisma.branch.create({ data: { name: `${PREFIX} clinic` } });
    try {
      await prisma.branchMember.createMany({
        data: [
          { userId: adminId, branchId: branch.id, role: "OWNER" },
          { userId, branchId: branch.id, role: "DOCTOR" },
        ],
      });
      await prisma.user.updateMany({ where: { id: { in: [adminId, userId] } }, data: { trialEndsAt: past } });
      expect(await accountAccess(userId)).toMatchObject({ allowed: true, state: "expired", coveredBy: { email: ADMIN_EMAIL } });
      vi.stubEnv("SUPER_ADMIN_EMAILS", "");
      expect(await accountAccess(userId)).toMatchObject({ allowed: false, coveredBy: null });
    } finally {
      await prisma.branchMember.deleteMany({ where: { branchId: branch.id } });
      await prisma.branch.delete({ where: { id: branch.id } });
    }
  });

  it("rejects bad values and disabling yourself", async () => {
    const { PATCH } = await import("../[userId]/route");
    expect((await PATCH(...patch(userId, { aiDailyLimit: -1 }))).status).toBe(400);
    expect((await PATCH(...patch(userId, { aiDailyLimit: 2.5 }))).status).toBe(400);
    expect((await PATCH(...patch(userId, { role: "ADMIN" }))).status).toBe(400);
    expect((await PATCH(...patch(adminId, { disabled: true }))).status).toBe(400);
    expect((await PATCH(...patch("missing-user", { aiDailyLimit: 5 }))).status).toBe(404);
  });
});
