import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const TEST_PREFIX = "appt-counts-";

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
  const patient = await prisma.patient.create({
    data: {
      firstName: "Pat",
      lastName: "One",
      branchId: branch.id,
      doctorId: doctor.id,
      reminderChannel: "WHATSAPP",
    },
  });
  return { owner, doctor, outsider, branch, patient };
}

function urlOf(qs: Record<string, string>): string {
  return `http://x/api/appointments/counts?${new URLSearchParams(qs).toString()}`;
}

describe("GET /api/appointments/counts", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(new Request(urlOf({ branchId: "x" })));
    expect(res.status).toBe(401);
  });

  it("returns 400 when branchId is missing", async () => {
    const { owner } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    const res = await GET(new Request("http://x/api/appointments/counts"));
    expect(res.status).toBe(400);
  });

  it("returns 404 (cross-branch leak) when caller is not a member", async () => {
    const { branch, outsider } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: outsider.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue(null);
    const res = await GET(new Request(urlOf({ branchId: branch.id })));
    expect(res.status).toBe(404);
  });

  it("returns counts grouped by status for the branch", async () => {
    const { owner, doctor, branch, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.appointment.createMany({
      data: [
        { branchId: branch.id, doctorId: doctor.id, patientId: patient.id, dateTime: future, duration: 30, status: "SCHEDULED" },
        { branchId: branch.id, doctorId: doctor.id, patientId: patient.id, dateTime: new Date(future.getTime() + 60 * 60_000), duration: 30, status: "COMPLETED" },
        { branchId: branch.id, doctorId: doctor.id, patientId: patient.id, dateTime: new Date(future.getTime() + 120 * 60_000), duration: 30, status: "CANCELLED" },
        { branchId: branch.id, doctorId: doctor.id, patientId: patient.id, dateTime: new Date(future.getTime() + 180 * 60_000), duration: 30, status: "NO_SHOW" },
      ],
    });

    const res = await GET(new Request(urlOf({ branchId: branch.id })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts.all).toBe(4);
    expect(body.counts.completed).toBe(1);
    expect(body.counts.cancelled).toBe(1);
    expect(body.counts.noshow).toBe(1);
    expect(body.counts.upcoming).toBe(1); // only the SCHEDULED future row
  });

  it("counts stale = SCHEDULED + dateTime < now", async () => {
    const { owner, doctor, branch, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.appointment.create({
      data: {
        branchId: branch.id,
        doctorId: doctor.id,
        patientId: patient.id,
        dateTime: past,
        duration: 30,
        status: "SCHEDULED",
      },
    });

    const res = await GET(new Request(urlOf({ branchId: branch.id })));
    const body = await res.json();
    expect(body.counts.stale).toBe(1);
  });

  it("filters by doctorIds CSV", async () => {
    const { owner, doctor, branch, patient } = await buildFixture();
    const stamp = Date.now() + Math.floor(Math.random() * 100000);
    const otherDoc = await prisma.user.create({
      data: { email: `${TEST_PREFIX}d2-${stamp}@t`, name: "Dr B" },
    });
    await prisma.branchMember.create({
      data: { userId: otherDoc.id, branchId: branch.id, role: "DOCTOR" },
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.appointment.createMany({
      data: [
        { branchId: branch.id, doctorId: doctor.id, patientId: patient.id, dateTime: future, duration: 30, status: "SCHEDULED" },
        { branchId: branch.id, doctorId: otherDoc.id, patientId: patient.id, dateTime: new Date(future.getTime() + 60 * 60_000), duration: 30, status: "COMPLETED" },
      ],
    });

    const res = await GET(
      new Request(urlOf({ branchId: branch.id, doctorIds: doctor.id }))
    );
    const body = await res.json();
    expect(body.counts.all).toBe(1);
    expect(body.counts.completed).toBe(0);
  });
});
