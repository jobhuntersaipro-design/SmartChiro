import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const TEST_PREFIX = "appt-post-";

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
    data: { email: `${TEST_PREFIX}o-${stamp}@t`, name: "O" },
  });
  const doctor = await prisma.user.create({
    data: { email: `${TEST_PREFIX}d-${stamp}@t`, name: "D" },
  });
  const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${stamp}` } });
  await prisma.branchMember.create({
    data: { userId: owner.id, branchId: branch.id, role: "OWNER" },
  });
  await prisma.branchMember.create({
    data: { userId: doctor.id, branchId: branch.id, role: "DOCTOR" },
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
  return { owner, doctor, branch, patient };
}

const futureIso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe("POST /api/appointments", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("creates a SCHEDULED appointment for a branch member with valid body", async () => {
    const { owner, doctor, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          patientId: patient.id,
          doctorId: doctor.id,
          dateTime: futureIso(48 * 60 * 60 * 1000),
          duration: 45,
          notes: "First visit",
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.appointment).toMatchObject({
      patientId: patient.id,
      doctorId: doctor.id,
      duration: 45,
      status: "SCHEDULED",
      notes: "First visit",
    });
  });

  it("default duration is 30 when omitted", async () => {
    const { owner, doctor, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          patientId: patient.id,
          doctorId: doctor.id,
          dateTime: futureIso(48 * 60 * 60 * 1000),
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.appointment.duration).toBe(30);
  });

  it("DOCTOR cannot POST with doctorId !== self → 403", async () => {
    const { doctor, patient } = await buildFixture();
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const otherDoc = await prisma.user.create({
      data: { email: `${TEST_PREFIX}other-${stamp}@t`, name: "Other" },
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: doctor.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("DOCTOR");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          patientId: patient.id,
          doctorId: otherDoc.id,
          dateTime: futureIso(48 * 60 * 60 * 1000),
        }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("dateTime in the past → 422 past_datetime", async () => {
    const { owner, doctor, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          patientId: patient.id,
          doctorId: doctor.id,
          dateTime: futureIso(-60 * 60 * 1000),
        }),
      })
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("past_datetime");
  });

  it("overlapping same-doctor appointment → 409 conflict", async () => {
    const { owner, doctor, patient, branch } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const t = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.appointment.create({
      data: {
        dateTime: t,
        duration: 30,
        patientId: patient.id,
        branchId: branch.id,
        doctorId: doctor.id,
      },
    });
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          patientId: patient.id,
          doctorId: doctor.id,
          dateTime: new Date(t.getTime() + 15 * 60 * 1000).toISOString(),
          duration: 30,
        }),
      })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
  });

  it("missing required field → 422 validation", async () => {
    const { owner, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          patientId: patient.id,
          // doctorId missing
          dateTime: futureIso(48 * 60 * 60 * 1000),
        }),
      })
    );
    expect(res.status).toBe(422);
  });

  it("patient in different branch (user not member) → 403", async () => {
    const { owner } = await buildFixture();
    // Create a totally separate branch + patient in it
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const otherBranch = await prisma.branch.create({
      data: { name: `${TEST_PREFIX}other-${stamp}` },
    });
    const otherDoc = await prisma.user.create({
      data: { email: `${TEST_PREFIX}otherdoc-${stamp}@t`, name: "Other" },
    });
    await prisma.branchMember.create({
      data: { userId: otherDoc.id, branchId: otherBranch.id, role: "DOCTOR" },
    });
    const otherPatient = await prisma.patient.create({
      data: {
        firstName: "X",
        lastName: "Y",
        email: `${TEST_PREFIX}xy-${stamp}@t`,
        branchId: otherBranch.id,
        doctorId: otherDoc.id,
        reminderChannel: "WHATSAPP",
      },
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    // owner has no role in `otherBranch`
    vi.mocked(getUserBranchRole).mockResolvedValue(null);
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          patientId: otherPatient.id,
          doctorId: otherDoc.id,
          dateTime: futureIso(48 * 60 * 60 * 1000),
        }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          patientId: "p",
          doctorId: "d",
          dateTime: futureIso(48 * 60 * 60 * 1000),
        }),
      })
    );
    expect(res.status).toBe(401);
  });
});
