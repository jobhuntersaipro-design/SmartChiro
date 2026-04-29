import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { PATCH } from "../route";
import { materializePending } from "@/lib/reminders/dispatcher";

const TEST_PREFIX = "rem-rs-";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

async function cleanup() {
  await prisma.appointmentReminder.deleteMany({
    where: { appointment: { branch: { name: { startsWith: TEST_PREFIX } } } },
  });
  await prisma.appointment.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.patient.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branchReminderSettings.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branchMember.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function buildFixture() {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const u = await prisma.user.create({
    data: { email: `${TEST_PREFIX}u-${stamp}@test.local`, name: "U" },
  });
  const b = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${stamp}` } });
  await prisma.branchMember.create({
    data: { userId: u.id, branchId: b.id, role: "OWNER" },
  });
  await prisma.branchReminderSettings.create({
    data: { branchId: b.id, enabled: true, offsetsMin: [1440], templates: {} },
  });
  const p = await prisma.patient.create({
    data: {
      firstName: "T",
      lastName: "P",
      email: `${TEST_PREFIX}p-${stamp}@t`,
      phone: "+60123",
      branchId: b.id,
      doctorId: u.id,
      reminderChannel: "WHATSAPP",
    },
  });
  const a = await prisma.appointment.create({
    data: {
      dateTime: new Date(Date.now() + 60 * 60 * 1000 * 48),
      patientId: p.id,
      branchId: b.id,
      doctorId: u.id,
    },
  });
  return { u, b, p, a };
}

describe("PATCH /api/appointments/:id", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("rescheduling clears PENDING reminders so they re-materialize at the new time", async () => {
    const { u, a } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: u.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    await materializePending(new Date());
    const before = await prisma.appointmentReminder.findMany({
      where: { appointmentId: a.id },
    });
    expect(before).toHaveLength(1);

    const newTime = new Date(Date.now() + 60 * 60 * 1000 * 72);
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ dateTime: newTime.toISOString() }),
      }),
      { params: Promise.resolve({ appointmentId: a.id }) }
    );
    expect(res.status).toBe(200);

    const afterReschedule = await prisma.appointmentReminder.findMany({
      where: { appointmentId: a.id },
    });
    expect(afterReschedule).toHaveLength(0);

    await materializePending(new Date());
    const remat = await prisma.appointmentReminder.findMany({
      where: { appointmentId: a.id },
    });
    expect(remat).toHaveLength(1);
    expect(remat[0].scheduledFor.getTime()).toBeGreaterThan(before[0].scheduledFor.getTime());
  });

  it("cancelling clears PENDING reminders and they don't re-materialize", async () => {
    const { u, a } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: u.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    await materializePending(new Date());
    expect(await prisma.appointmentReminder.count({ where: { appointmentId: a.id } })).toBe(1);

    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ status: "CANCELLED" }),
      }),
      { params: Promise.resolve({ appointmentId: a.id }) }
    );
    expect(res.status).toBe(200);

    expect(await prisma.appointmentReminder.count({ where: { appointmentId: a.id } })).toBe(0);
    await materializePending(new Date());
    expect(await prisma.appointmentReminder.count({ where: { appointmentId: a.id } })).toBe(0);
  });

  it("returns 403 for non-member non-doctor", async () => {
    const { a } = await buildFixture();
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const stranger = await prisma.user.create({
      data: { email: `${TEST_PREFIX}str-${stamp}@test.local`, name: "S" },
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: stranger.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue(null);
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ status: "CANCELLED" }),
      }),
      { params: Promise.resolve({ appointmentId: a.id }) }
    );
    expect(res.status).toBe(403);
  });
});
