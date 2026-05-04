import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { PATCH } from "../route";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

const TEST_PREFIX = "test-pastedit-";

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
  await prisma.branchMember.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function buildPastAppt() {
  const stamp = Date.now() + Math.floor(Math.random() * 100000);
  const owner = await prisma.user.create({
    data: { email: `${TEST_PREFIX}owner-${stamp}@t`, name: "O" },
  });
  const admin = await prisma.user.create({
    data: { email: `${TEST_PREFIX}adm-${stamp}@t`, name: "A" },
  });
  const doctor = await prisma.user.create({
    data: { email: `${TEST_PREFIX}doc-${stamp}@t`, name: "D" },
  });
  const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${stamp}` } });
  await prisma.branchMember.create({
    data: { userId: owner.id, branchId: branch.id, role: "OWNER" },
  });
  await prisma.branchMember.create({
    data: { userId: admin.id, branchId: branch.id, role: "ADMIN" },
  });
  await prisma.branchMember.create({
    data: { userId: doctor.id, branchId: branch.id, role: "DOCTOR" },
  });

  const patient = await prisma.patient.create({
    data: {
      firstName: "P",
      lastName: "Past",
      branchId: branch.id,
      doctorId: doctor.id,
    },
  });
  const past = await prisma.appointment.create({
    data: {
      dateTime: new Date(Date.now() - 24 * 3600 * 1000),
      status: "COMPLETED",
      patientId: patient.id,
      branchId: branch.id,
      doctorId: doctor.id,
    },
  });
  return { ownerId: owner.id, adminId: admin.id, doctorId: doctor.id, branchId: branch.id, appointmentId: past.id };
}

describe("PATCH /api/appointments/:id past-edit guard", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  it("DOCTOR attempting PATCH on past appointment → 403", async () => {
    const fx = await buildPastAppt();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.doctorId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("DOCTOR");
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ notes: "trying" }),
      }),
      { params: Promise.resolve({ appointmentId: fx.appointmentId }) }
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("forbidden_past_edit");
  });

  it("ADMIN PATCH dateTime on past appointment → 422 cannot_reschedule_past", async () => {
    const fx = await buildPastAppt();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.adminId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("ADMIN");
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ dateTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString() }),
      }),
      { params: Promise.resolve({ appointmentId: fx.appointmentId }) }
    );
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe("cannot_reschedule_past");
  });

  it("ADMIN PATCH status + notes on past appointment → 200", async () => {
    const fx = await buildPastAppt();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.adminId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("ADMIN");
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ status: "NO_SHOW", notes: "Patient didn't show up" }),
      }),
      { params: Promise.resolve({ appointmentId: fx.appointmentId }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.appointment.status).toBe("NO_SHOW");
    expect(data.appointment.notes).toBe("Patient didn't show up");
  });
});
