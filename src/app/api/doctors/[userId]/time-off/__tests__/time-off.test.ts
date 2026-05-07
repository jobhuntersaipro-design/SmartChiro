import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "../route";
import { DELETE } from "../[timeOffId]/route";

const TEST_PREFIX = "doc-timeoff-";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
}));
import { getCurrentUser } from "@/lib/auth-utils";

async function cleanup() {
  await prisma.doctorTimeOff.deleteMany({
    where: { user: { email: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branchMember.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function buildFixture() {
  const stamp = Date.now() + Math.floor(Math.random() * 100000);
  const owner = await prisma.user.create({
    data: { email: `${TEST_PREFIX}o-${stamp}@t`, name: "Owner" },
  });
  const doctor = await prisma.user.create({
    data: { email: `${TEST_PREFIX}d-${stamp}@t`, name: "Dr A" },
  });
  const outsider = await prisma.user.create({
    data: { email: `${TEST_PREFIX}out-${stamp}@t`, name: "Outsider" },
  });
  const branch = await prisma.branch.create({
    data: { name: `${TEST_PREFIX}b-${stamp}` },
  });
  await prisma.branchMember.createMany({
    data: [
      { userId: owner.id, branchId: branch.id, role: "OWNER" },
      { userId: doctor.id, branchId: branch.id, role: "DOCTOR" },
    ],
  });
  return { owner, doctor, outsider, branch };
}

describe("GET /api/doctors/[userId]/time-off", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ userId: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 cross-branch leak when caller has no shared membership", async () => {
    const { doctor, outsider } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: outsider.id } as never);
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ userId: doctor.id }),
    });
    expect(res.status).toBe(404);
  });

  it("OWNER can list a doctor's time-off", async () => {
    const { owner, doctor, branch } = await buildFixture();
    await prisma.doctorTimeOff.create({
      data: {
        userId: doctor.id,
        branchId: branch.id,
        type: "ANNUAL_LEAVE",
        startDate: new Date(Date.now() + 86400_000),
        endDate: new Date(Date.now() + 5 * 86400_000),
      },
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ userId: doctor.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeOff).toHaveLength(1);
    expect(body.timeOff[0].type).toBe("ANNUAL_LEAVE");
  });
});

describe("POST /api/doctors/[userId]/time-off", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("DOCTOR can create their own leave", async () => {
    const { doctor, branch } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: doctor.id } as never);
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          type: "SICK_LEAVE",
          startDate: new Date(Date.now() + 86400_000).toISOString(),
          endDate: new Date(Date.now() + 2 * 86400_000).toISOString(),
          branchId: branch.id,
        }),
      }),
      { params: Promise.resolve({ userId: doctor.id }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.timeOffId).toBeDefined();
  });

  it("DOCTOR cannot create leave for another doctor (404 — same-branch peer access not exposed)", async () => {
    const { doctor, branch } = await buildFixture();
    const stamp = Date.now() + Math.floor(Math.random() * 100000);
    const otherDoc = await prisma.user.create({
      data: { email: `${TEST_PREFIX}d2-${stamp}@t`, name: "Dr B" },
    });
    await prisma.branchMember.create({
      data: { userId: otherDoc.id, branchId: branch.id, role: "DOCTOR" },
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: doctor.id } as never);
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          type: "ANNUAL_LEAVE",
          startDate: new Date(Date.now() + 86400_000).toISOString(),
          endDate: new Date(Date.now() + 2 * 86400_000).toISOString(),
        }),
      }),
      { params: Promise.resolve({ userId: otherDoc.id }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 for inverted date range", async () => {
    const { doctor } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: doctor.id } as never);
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          type: "ANNUAL_LEAVE",
          startDate: new Date(Date.now() + 2 * 86400_000).toISOString(),
          endDate: new Date(Date.now() + 86400_000).toISOString(),
        }),
      }),
      { params: Promise.resolve({ userId: doctor.id }) }
    );
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/doctors/[userId]/time-off/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("OWNER can delete a doctor's leave", async () => {
    const { owner, doctor, branch } = await buildFixture();
    const row = await prisma.doctorTimeOff.create({
      data: {
        userId: doctor.id,
        branchId: branch.id,
        type: "ANNUAL_LEAVE",
        startDate: new Date(Date.now() + 86400_000),
        endDate: new Date(Date.now() + 2 * 86400_000),
      },
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    const res = await DELETE(new Request("http://x"), {
      params: Promise.resolve({ userId: doctor.id, timeOffId: row.id }),
    });
    expect(res.status).toBe(200);
    const remaining = await prisma.doctorTimeOff.count({ where: { id: row.id } });
    expect(remaining).toBe(0);
  });
});
