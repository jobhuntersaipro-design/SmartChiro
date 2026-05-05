import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const TEST_PREFIX = "appt-cc-";

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
  const doctor = await prisma.user.create({
    data: { email: `${TEST_PREFIX}d-${stamp}@t`, name: "D" },
  });
  const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${stamp}` } });
  await prisma.branchMember.create({
    data: { userId: doctor.id, branchId: branch.id, role: "OWNER" },
  });
  const patient = await prisma.patient.create({
    data: {
      firstName: "P",
      lastName: "X",
      email: `${TEST_PREFIX}p-${stamp}@t`,
      branchId: branch.id,
      doctorId: doctor.id,
      reminderChannel: "WHATSAPP",
    },
  });
  return { doctor, branch, patient };
}

const url = (q: Record<string, string>) => {
  const usp = new URLSearchParams(q).toString();
  return `http://x/api/appointments/check-conflict?${usp}`;
};

describe("GET /api/appointments/check-conflict", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(
      new Request(
        url({
          doctorId: "d",
          dateTime: new Date().toISOString(),
          duration: "30",
        })
      )
    );
    expect(res.status).toBe(401);
  });

  it("422 when required query params missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u" } as never);
    const res = await GET(new Request("http://x/api/appointments/check-conflict"));
    expect(res.status).toBe(422);
  });

  it("returns empty conflicts array when no overlap", async () => {
    const { doctor } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: doctor.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const res = await GET(
      new Request(
        url({
          doctorId: doctor.id,
          dateTime: new Date(Date.now() + 86_400_000).toISOString(),
          duration: "30",
        })
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conflicts).toEqual([]);
  });

  it("detects same-doctor overlap", async () => {
    const { doctor, branch, patient } = await buildFixture();
    const t = new Date(Date.now() + 86_400_000);
    await prisma.appointment.create({
      data: {
        dateTime: t,
        duration: 30,
        patientId: patient.id,
        branchId: branch.id,
        doctorId: doctor.id,
      },
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: doctor.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const res = await GET(
      new Request(
        url({
          doctorId: doctor.id,
          dateTime: new Date(t.getTime() + 15 * 60 * 1000).toISOString(),
          duration: "30",
        })
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts[0]).toMatchObject({
      duration: 30,
      patient: { firstName: "P", lastName: "X" },
    });
  });

  it("excludeId filters out the named appointment", async () => {
    const { doctor, branch, patient } = await buildFixture();
    const t = new Date(Date.now() + 86_400_000);
    const a = await prisma.appointment.create({
      data: {
        dateTime: t,
        duration: 30,
        patientId: patient.id,
        branchId: branch.id,
        doctorId: doctor.id,
      },
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: doctor.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const res = await GET(
      new Request(
        url({
          doctorId: doctor.id,
          dateTime: t.toISOString(),
          duration: "30",
          excludeId: a.id,
        })
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conflicts).toEqual([]);
  });
});
