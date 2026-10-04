import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { accountAccess } from "../subscription";

const PREFIX = `test-subscription-${Date.now()}`;
const PAST = new Date(Date.now() - 86_400_000);
const FUTURE = new Date(Date.now() + 10 * 86_400_000);

async function user(name: string, data: { trialEndsAt?: Date | null; subscriptionStatus?: string } = {}) {
  return prisma.user.create({ data: { email: `${PREFIX}-${name}@t.com`, name, ...data } });
}

async function branch(name: string, billingUserId: string | null, members: [string, "OWNER" | "ADMIN" | "DOCTOR"][]) {
  return prisma.branch.create({
    data: {
      name: `${PREFIX} ${name}`,
      billingUserId,
      members: { create: members.map(([userId, role]) => ({ userId, role })) },
    },
  });
}

describe("accountAccess", () => {
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await prisma.branch.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  });

  describe("staff", () => {
    let ownerId: string;
    let staffId: string;
    beforeAll(async () => {
      ownerId = (await user("owner", { trialEndsAt: FUTURE })).id;
      // A fresh account with its own trial, working in the owner's clinic.
      staffId = (await user("staff", { trialEndsAt: FUTURE })).id;
      await branch("clinic", ownerId, [[ownerId, "OWNER"], [staffId, "ADMIN"]]);
    });

    it("are covered by the billing account's trial, and their own trial doesn't count", async () => {
      expect(await accountAccess(staffId)).toMatchObject({ allowed: true, staffOnly: true, state: "expired", coveredBy: { name: "owner" } });
      expect(await accountAccess(ownerId)).toMatchObject({ allowed: true, staffOnly: false, state: "trial", coveredBy: null });

      await prisma.user.update({ where: { id: ownerId }, data: { trialEndsAt: PAST } });
      // Staff can't keep the clinic open on a trial of their own.
      expect(await accountAccess(staffId)).toMatchObject({ allowed: false, coveredBy: null });

      await prisma.user.update({ where: { id: ownerId }, data: { subscriptionStatus: "active" } });
      expect(await accountAccess(staffId)).toMatchObject({ allowed: true, coveredBy: { name: "owner" } });
    });
  });

  it("an ownership transfer doesn't hand the bill to the new owner", async () => {
    const attacker = await user("attacker", { trialEndsAt: PAST });
    const payer = await user("payer", { subscriptionStatus: "active" });
    // The attacker's branch, with a subscribed account made OWNER of it.
    await branch("borrowed", attacker.id, [[attacker.id, "ADMIN"], [payer.id, "OWNER"]]);
    expect(await accountAccess(attacker.id)).toMatchObject({ allowed: false, coveredBy: null });
  });

  it("a super admin's own clinics cover their staff; being made OWNER elsewhere doesn't", async () => {
    const admin = await user("admin", { trialEndsAt: PAST });
    vi.stubEnv("SUPER_ADMIN_EMAILS", admin.email);
    const doctor = await user("doctor", { trialEndsAt: null });
    await branch("admin clinic", admin.id, [[admin.id, "OWNER"], [doctor.id, "DOCTOR"]]);
    expect(await accountAccess(admin.id)).toMatchObject({ allowed: true, superAdmin: true });
    expect(await accountAccess(doctor.id)).toMatchObject({ allowed: true, coveredBy: { email: admin.email } });

    const sneaky = await user("sneaky", { trialEndsAt: PAST });
    await branch("sneaky clinic", sneaky.id, [[sneaky.id, "ADMIN"], [admin.id, "OWNER"]]);
    expect(await accountAccess(sneaky.id)).toMatchObject({ allowed: false });
  });

  it("someone with no clinic yet uses their own trial; a branch without a billing account doesn't lock them out", async () => {
    const solo = await user("solo", { trialEndsAt: FUTURE });
    expect(await accountAccess(solo.id)).toMatchObject({ allowed: true, staffOnly: false, state: "trial" });
    await branch("orphan", null, [[solo.id, "DOCTOR"]]);
    expect(await accountAccess(solo.id)).toMatchObject({ allowed: true, staffOnly: false, state: "trial" });
  });

  // G5: a lapsed owner working at a paying clinic still has to pay for their own.
  it("an account that bills a branch isn't covered by another clinic it works at", async () => {
    const bob = await user("bob", { trialEndsAt: PAST });
    const alice = await user("alice", { subscriptionStatus: "active" });
    await branch("bob clinic", bob.id, [[bob.id, "OWNER"]]);
    await branch("alice clinic", alice.id, [[alice.id, "OWNER"], [bob.id, "DOCTOR"]]);
    expect(await accountAccess(bob.id)).toMatchObject({ allowed: false, staffOnly: false, state: "expired", coveredBy: null });
  });

  it("is never allowed when disabled", async () => {
    const off = await user("off", { subscriptionStatus: "active" });
    await prisma.user.update({ where: { id: off.id }, data: { disabledAt: new Date() } });
    expect(await accountAccess(off.id)).toMatchObject({ allowed: false, disabled: true });
    expect(await accountAccess("no-such-user")).toBeNull();
  });
});
