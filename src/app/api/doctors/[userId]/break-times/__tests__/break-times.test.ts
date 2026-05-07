import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET, PUT } from "../route";

const TEST_PREFIX = "doc-break-";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
}));
import { getCurrentUser } from "@/lib/auth-utils";

async function cleanup() {
  await prisma.doctorBreakTime.deleteMany({
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
  const branch = await prisma.branch.create({
    data: { name: `${TEST_PREFIX}b-${stamp}` },
  });
  await prisma.branchMember.createMany({
    data: [
      { userId: owner.id, branchId: branch.id, role: "OWNER" },
      { userId: doctor.id, branchId: branch.id, role: "DOCTOR" },
    ],
  });
  return { owner, doctor, branch };
}

describe("PUT /api/doctors/[userId]/break-times", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("DOCTOR can replace their own break-time set for a branch", async () => {
    const { doctor, branch } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: doctor.id } as never);
    const res = await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({
          branchId: branch.id,
          slots: [
            { branchId: branch.id, dayOfWeek: 1, startMinute: 720, endMinute: 780, label: "Lunch" },
            { branchId: branch.id, dayOfWeek: 3, startMinute: 720, endMinute: 780, label: "Lunch" },
          ],
        }),
      }),
      { params: Promise.resolve({ userId: doctor.id }) }
    );
    expect(res.status).toBe(200);
    const stored = await prisma.doctorBreakTime.count({
      where: { userId: doctor.id, branchId: branch.id },
    });
    expect(stored).toBe(2);
  });

  it("PUT replaces existing slots for the same branch (deleteMany + createMany)", async () => {
    const { doctor, branch } = await buildFixture();
    await prisma.doctorBreakTime.create({
      data: {
        userId: doctor.id,
        branchId: branch.id,
        dayOfWeek: 5,
        startMinute: 600,
        endMinute: 660,
        label: "Old",
      },
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: doctor.id } as never);
    await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({
          branchId: branch.id,
          slots: [
            { branchId: branch.id, dayOfWeek: 1, startMinute: 720, endMinute: 780, label: "New" },
          ],
        }),
      }),
      { params: Promise.resolve({ userId: doctor.id }) }
    );
    const all = await prisma.doctorBreakTime.findMany({
      where: { userId: doctor.id, branchId: branch.id },
    });
    expect(all).toHaveLength(1);
    expect(all[0].label).toBe("New");
  });

  it("returns 422 when a slot's branchId mismatches the request branchId", async () => {
    const { doctor, branch } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: doctor.id } as never);
    const res = await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({
          branchId: branch.id,
          slots: [
            { branchId: "wrong", dayOfWeek: 1, startMinute: 720, endMinute: 780, label: "x" },
          ],
        }),
      }),
      { params: Promise.resolve({ userId: doctor.id }) }
    );
    expect(res.status).toBe(422);
  });
});

describe("GET /api/doctors/[userId]/break-times", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("returns slots filtered by branchId when provided", async () => {
    const { owner, doctor, branch } = await buildFixture();
    await prisma.doctorBreakTime.create({
      data: { userId: doctor.id, branchId: branch.id, dayOfWeek: 1, startMinute: 720, endMinute: 780 },
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    const url = new URL(`http://x?branchId=${branch.id}`);
    const res = await GET(new Request(url), {
      params: Promise.resolve({ userId: doctor.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.breakTimes).toHaveLength(1);
  });
});
