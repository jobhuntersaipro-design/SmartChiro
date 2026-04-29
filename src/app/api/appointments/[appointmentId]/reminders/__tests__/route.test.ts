import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const TEST_PREFIX = "rem-appt-";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

async function cleanup() {
  await prisma.appointmentReminder.deleteMany({
    where: { appointment: { patient: { email: { startsWith: TEST_PREFIX } } } },
  });
  await prisma.appointment.deleteMany({
    where: { patient: { email: { startsWith: TEST_PREFIX } } },
  });
  await prisma.patient.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
  await prisma.branchMember.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function buildFixture(role: "DOCTOR" | null = "DOCTOR") {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const u = await prisma.user.create({
    data: { email: `${TEST_PREFIX}u-${stamp}@test.local`, name: "U" },
  });
  const b = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${stamp}` } });
  if (role) {
    await prisma.branchMember.create({
      data: { userId: u.id, branchId: b.id, role },
    });
  }
  const p = await prisma.patient.create({
    data: {
      firstName: "T",
      lastName: "P",
      email: `${TEST_PREFIX}p-${stamp}@t`,
      branchId: b.id,
      doctorId: u.id,
    },
  });
  const a = await prisma.appointment.create({
    data: {
      dateTime: new Date(Date.now() + 3600000),
      patientId: p.id,
      branchId: b.id,
      doctorId: u.id,
    },
  });
  return { u, b, p, a };
}

describe("GET /api/appointments/:id/reminders", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("returns the rows for a member", async () => {
    const { u, a } = await buildFixture("DOCTOR");
    await prisma.appointmentReminder.create({
      data: {
        appointmentId: a.id,
        channel: "WHATSAPP",
        offsetMin: 1440,
        scheduledFor: new Date(),
      },
    });

    vi.mocked(getCurrentUser).mockResolvedValue({ id: u.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("DOCTOR");

    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ appointmentId: a.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reminders).toHaveLength(1);
    expect(body.reminders[0].channel).toBe("WHATSAPP");
  });

  it("returns 403 for non-members", async () => {
    const { u, a } = await buildFixture(null);

    vi.mocked(getCurrentUser).mockResolvedValue({ id: u.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue(null);

    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ appointmentId: a.id }),
    });
    expect(res.status).toBe(403);
  });
});
