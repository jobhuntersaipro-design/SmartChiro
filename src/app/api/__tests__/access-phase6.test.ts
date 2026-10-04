import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

// Bug-fix plan 2, Phase 6 (accounts and access).

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

const P = `test-access6-${Date.now()}`;
let owner: string, admin: string, doc: string, outsider: string, branchId: string, otherBranch: string;

const as = (id: string) => vi.mocked(auth).mockResolvedValue({ user: { id, email: `${id}@t` } } as never);
const json = (method: string, body?: unknown) =>
  new Request("http://x", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

beforeAll(async () => {
  const mk = (n: string) => prisma.user.create({ data: { email: `${P}-${n}@t.com`, name: n } }).then((u) => u.id);
  [owner, admin, doc, outsider] = await Promise.all([mk("owner"), mk("admin"), mk("doc"), mk("outsider")]);
  branchId = (await prisma.branch.create({ data: { name: `${P} A`, billingUserId: owner } })).id;
  otherBranch = (await prisma.branch.create({ data: { name: `${P} B`, billingUserId: outsider } })).id;
  await prisma.branchMember.createMany({
    data: [
      { userId: owner, branchId, role: "OWNER" },
      { userId: admin, branchId, role: "ADMIN" },
      { userId: doc, branchId, role: "DOCTOR" },
      { userId: outsider, branchId: otherBranch, role: "OWNER" },
      { userId: doc, branchId: otherBranch, role: "DOCTOR" },
    ],
  });
}, 30_000);

afterAll(async () => {
  await prisma.branch.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
});

describe("G7 — the branch owner is protected from admins", () => {
  it("an admin can't deactivate or rename the owner; the owner can switch themselves back on", async () => {
    const { PATCH } = await import("../doctors/[userId]/status/route");
    const { PUT } = await import("../doctors/[userId]/route");
    as(admin);
    expect((await PATCH(json("PATCH", { isActive: false }) as never, params({ userId: owner }))).status).toBe(403);
    expect((await PUT(json("PUT", { name: "Renamed" }) as never, params({ userId: owner }))).status).toBe(403);
    // Admins still manage doctors
    expect((await PATCH(json("PATCH", { isActive: false }) as never, params({ userId: doc }))).status).toBe(403); // doc also works at B
    await prisma.doctorProfile.upsert({ where: { userId: owner }, create: { userId: owner, isActive: false }, update: { isActive: false } });
    as(owner);
    expect((await PATCH(json("PATCH", { isActive: false }) as never, params({ userId: owner }))).status).toBe(403);
    expect((await PATCH(json("PATCH", { isActive: true }) as never, params({ userId: owner }))).status).toBe(200);
    expect((await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: owner } })).isActive).toBe(true);
  });

  it("toggling office staff doesn't create a doctor profile", async () => {
    const { PATCH } = await import("../doctors/[userId]/status/route");
    as(owner);
    expect((await PATCH(json("PATCH", { isActive: false }) as never, params({ userId: admin }))).status).toBe(409);
    expect(await prisma.doctorProfile.findUnique({ where: { userId: admin } })).toBeNull();
  });
});

describe("G8 — invites", () => {
  it("lapse after 14 days, can be withdrawn, and die with the inviter's rights", async () => {
    const { answerInvite } = await import("@/lib/branch-invites");
    const invitee = (await prisma.user.create({ data: { email: `${P}-inv@t.com`, name: "Inv" } })).id;
    const old = await prisma.branchInvite.create({
      data: { userId: invitee, branchId, role: "DOCTOR", invitedById: owner, createdAt: new Date(Date.now() - 15 * 86_400_000) },
    });
    expect(await answerInvite(invitee, old.id, true)).toBe(false);

    // Sent by an admin who was then removed
    const fresh = await prisma.branchInvite.create({ data: { userId: invitee, branchId, role: "ADMIN", invitedById: outsider } });
    expect(await answerInvite(invitee, fresh.id, true)).toBe(false);
    expect(await prisma.branchMember.count({ where: { userId: invitee, branchId } })).toBe(0);

    // List and withdraw (staff managers only)
    const live = await prisma.branchInvite.create({ data: { userId: invitee, branchId, role: "DOCTOR", invitedById: owner } });
    const { GET } = await import("../branches/[branchId]/invites/route");
    const { DELETE } = await import("../branches/[branchId]/invites/[inviteId]/route");
    as(doc);
    expect((await GET(json("GET"), params({ branchId }))).status).toBe(403);
    as(admin);
    const { invites } = await (await GET(json("GET"), params({ branchId }))).json();
    expect(invites.map((i: { id: string }) => i.id)).toEqual([live.id]);
    expect((await DELETE(json("DELETE"), params({ branchId: otherBranch, inviteId: live.id }))).status).toBe(403);
    expect((await DELETE(json("DELETE"), params({ branchId, inviteId: live.id }))).status).toBe(200);
    expect(await prisma.branchInvite.count({ where: { id: live.id } })).toBe(0);
  });
});

describe("G9 — deleting a branch", () => {
  it("is refused with issued invoices; otherwise its leave goes with it instead of covering every branch", async () => {
    const { DELETE } = await import("../branches/[branchId]/route");
    const solo = (await prisma.user.create({ data: { email: `${P}-solo@t.com`, name: "Solo" } })).id;
    const temp = (await prisma.branch.create({ data: { name: `${P} Temp`, billingUserId: solo } })).id;
    await prisma.branchMember.createMany({ data: [{ userId: solo, branchId: temp, role: "OWNER" }, { userId: doc, branchId: temp, role: "DOCTOR" }] });
    const patientId = (await prisma.patient.create({ data: { firstName: "T", lastName: P, branchId: temp, doctorId: doc } })).id;
    const inv = await prisma.invoice.create({
      data: { invoiceNumber: `${P}-1`, amount: 10, status: "SENT", lineItems: [], patientId, branchId: temp },
    });
    await prisma.doctorTimeOff.create({
      data: { userId: doc, branchId: temp, type: "ANNUAL_LEAVE", startDate: new Date(), endDate: new Date(Date.now() + 86_400_000) },
    });
    as(solo);
    const res = await DELETE(json("DELETE") as never, params({ branchId: temp }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("branch_has_invoices");

    await prisma.invoice.update({ where: { id: inv.id }, data: { status: "DRAFT" } });
    expect((await DELETE(json("DELETE") as never, params({ branchId: temp }))).status).toBe(200);
    expect(await prisma.doctorTimeOff.count({ where: { userId: doc, branchId: null } })).toBe(0);
  });
});

describe("G10 — doctor profile shows only shared branches", () => {
  it("another clinic's owner sees their own branch and their own counts only", async () => {
    await prisma.patient.create({ data: { firstName: "A", lastName: P, branchId, doctorId: doc } });
    await prisma.patient.create({ data: { firstName: "B", lastName: P, branchId: otherBranch, doctorId: doc } });
    const { GET } = await import("../doctors/[userId]/route");
    as(outsider);
    const { NextRequest } = await import("next/server");
    const { doctor } = await (await GET(new NextRequest("http://x"), params({ userId: doc }))).json();
    expect(doctor.branches.map((b: { id: string }) => b.id)).toEqual([otherBranch]);
    expect(doctor.stats.patientCount).toBe(1);
  });
});

describe("G11 — a removed doctor loses their old visits", () => {
  it("can't edit or delete visits they wrote once they're out of the branch", async () => {
    const leaver = (await prisma.user.create({ data: { email: `${P}-leaver@t.com`, name: "Leaver" } })).id;
    const patientId = (await prisma.patient.create({ data: { firstName: "V", lastName: P, branchId, doctorId: owner } })).id;
    const visit = await prisma.visit.create({ data: { patientId, doctorId: leaver, subjective: "note" } });
    const { PUT, DELETE } = await import("../patients/[patientId]/visits/[visitId]/route");
    as(leaver);
    expect((await PUT(json("PUT", { subjective: "rewritten" }) as never, params({ patientId, visitId: visit.id }))).status).toBe(403);
    expect((await DELETE(json("DELETE") as never, params({ patientId, visitId: visit.id }))).status).toBe(403);
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).subjective).toBe("note");
  });
});
