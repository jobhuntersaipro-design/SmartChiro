import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Bug-fix plan, Phase 5: patient identity per branch (D4), one IC form,
// and bad input answered with 400 instead of 500.

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

const P = `test-p5-${Date.now()}`;
let ownerA: string, ownerB: string, branchA: string, branchB: string;
const as = async (id: string, branchId: string) => {
  await prisma.user.update({ where: { id }, data: { activeBranchId: branchId } });
  mockAuth.mockResolvedValue({ user: { id, email: `${id}@t`, name: "Owner" } });
};
const post = (body: unknown) =>
  new NextRequest("http://x/api/patients", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const IC = `9${String(Date.now()).slice(-5)}-14-1234`; // a fresh, valid-looking MyKad

beforeAll(async () => {
  ownerA = (await prisma.user.create({ data: { email: `${P}-a@t.com` } })).id;
  ownerB = (await prisma.user.create({ data: { email: `${P}-b@t.com` } })).id;
  branchA = (await prisma.branch.create({ data: { name: `${P} A`, billingUserId: ownerA } })).id;
  branchB = (await prisma.branch.create({ data: { name: `${P} B`, billingUserId: ownerB } })).id;
  await prisma.branchMember.createMany({
    data: [
      { userId: ownerA, branchId: branchA, role: "OWNER" },
      { userId: ownerB, branchId: branchB, role: "OWNER" },
    ],
  });
}, 30_000);

afterAll(async () => {
  await prisma.branch.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
});

describe("P1 / P2 — one IC form; email and IC unique per clinic", () => {
  it("the same IC without dashes is a duplicate in the same branch, but another clinic can register the person", async () => {
    const { POST } = await import("../patients/route");
    const email = `${P}-mei@example.com`;
    await as(ownerA, branchA);
    const first = await POST(post({ firstName: "Mei", lastName: P, icNumber: IC.replace(/-/g, ""), email }));
    expect(first.status).toBe(201);
    expect((await first.json()).icNumber).toBe(IC);

    const again = await POST(post({ firstName: "Mei", lastName: P, icNumber: IC }));
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("duplicate_patient");

    // Clinic B treats the same person: same IC and email, its own record.
    await as(ownerB, branchB);
    const other = await POST(post({ firstName: "Mei", lastName: P, icNumber: IC, email }));
    expect(other.status).toBe(201);
    expect(await prisma.patient.count({ where: { icNumber: IC } })).toBe(2);
  });
});

describe("P10 — bad input is a 400", () => {
  it("register with a non-string email", async () => {
    const { POST } = await import("../auth/register/route");
    const res = await POST(
      new NextRequest("http://x/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name: "X", email: 42, password: "password1", confirmPassword: "password1" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("dashboard activity with ?limit=abc", async () => {
    await as(ownerA, branchA);
    const { GET } = await import("../dashboard/activity/route");
    const res = await GET(new NextRequest(`http://x/api/dashboard/activity?branchId=${branchA}&limit=abc`));
    expect(res.status).toBe(200);
  });
});
