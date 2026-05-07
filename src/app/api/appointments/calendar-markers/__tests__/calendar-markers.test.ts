import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const TEST_PREFIX = "appt-markers-";

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
  return { owner, doctor, branch, patient };
}

function urlOf(qs: Record<string, string>): string {
  return `http://x/api/appointments/calendar-markers?${new URLSearchParams(
    qs
  ).toString()}`;
}

describe("GET /api/appointments/calendar-markers", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(
      new Request(urlOf({ branchId: "x", start: "2026-01-01", end: "2026-12-31" }))
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 (cross-branch leak) when caller is not a member", async () => {
    const { branch } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "outsider" } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue(null);
    const res = await GET(
      new Request(
        urlOf({
          branchId: branch.id,
          start: new Date().toISOString(),
          end: new Date(Date.now() + 86_400_000).toISOString(),
        })
      )
    );
    expect(res.status).toBe(404);
  });

  it("returns sorted unique date strings for days with appointments", async () => {
    const { owner, doctor, branch, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const day1 = new Date();
    day1.setHours(10, 0, 0, 0);
    const day2 = new Date(day1);
    day2.setDate(day2.getDate() + 2);

    await prisma.appointment.createMany({
      data: [
        { branchId: branch.id, doctorId: doctor.id, patientId: patient.id, dateTime: day1, duration: 30, status: "SCHEDULED" },
        // Same day, should de-dup
        { branchId: branch.id, doctorId: doctor.id, patientId: patient.id, dateTime: new Date(day1.getTime() + 60 * 60_000), duration: 30, status: "SCHEDULED" },
        { branchId: branch.id, doctorId: doctor.id, patientId: patient.id, dateTime: day2, duration: 30, status: "SCHEDULED" },
      ],
    });

    const res = await GET(
      new Request(
        urlOf({
          branchId: branch.id,
          start: new Date(day1.getTime() - 86_400_000).toISOString(),
          end: new Date(day2.getTime() + 86_400_000).toISOString(),
        })
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dates).toHaveLength(2);
    // Sorted ascending
    expect(body.dates[0] < body.dates[1]).toBe(true);
  });

  it("excludes CANCELLED and NO_SHOW from markers", async () => {
    const { owner, doctor, branch, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const day = new Date();
    day.setHours(10, 0, 0, 0);
    await prisma.appointment.createMany({
      data: [
        { branchId: branch.id, doctorId: doctor.id, patientId: patient.id, dateTime: day, duration: 30, status: "CANCELLED" },
      ],
    });

    const res = await GET(
      new Request(
        urlOf({
          branchId: branch.id,
          start: new Date(day.getTime() - 86_400_000).toISOString(),
          end: new Date(day.getTime() + 86_400_000).toISOString(),
        })
      )
    );
    const body = await res.json();
    expect(body.dates).toHaveLength(0);
  });
});
