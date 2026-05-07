import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const TEST_PREFIX = "appt-get-";

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
  const doctorA = await prisma.user.create({
    data: { email: `${TEST_PREFIX}da-${stamp}@t`, name: "Dr A" },
  });
  const doctorB = await prisma.user.create({
    data: { email: `${TEST_PREFIX}db-${stamp}@t`, name: "Dr B" },
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
      { userId: doctorA.id, branchId: branch.id, role: "DOCTOR" },
      { userId: doctorB.id, branchId: branch.id, role: "DOCTOR" },
    ],
  });
  const patient = await prisma.patient.create({
    data: {
      firstName: "Pat",
      lastName: "One",
      branchId: branch.id,
      doctorId: doctorA.id,
      reminderChannel: "WHATSAPP",
    },
  });
  return { owner, doctorA, doctorB, outsider, branch, patient };
}

const futureIso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

function urlOf(qs: Record<string, string>): string {
  const sp = new URLSearchParams(qs);
  return `http://x/api/appointments?${sp.toString()}`;
}

describe("GET /api/appointments (calendar list)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(new Request(urlOf({ branchId: "x" })));
    expect(res.status).toBe(401);
  });

  it("returns 400 when branchId or window is missing", async () => {
    const { owner } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    const res = await GET(new Request("http://x/api/appointments"));
    expect(res.status).toBe(400);
  });

  it("returns 404 (cross-branch leak) when caller is not a member", async () => {
    const { branch, outsider } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: outsider.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue(null);
    const res = await GET(
      new Request(
        urlOf({
          branchId: branch.id,
          start: futureIso(0),
          end: futureIso(7 * 24 * 60 * 60 * 1000),
        })
      )
    );
    expect(res.status).toBe(404);
  });

  it("returns appointments within the [start,end) window for the branch", async () => {
    const { owner, doctorA, branch, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const inWindow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const outOfWindow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.appointment.createMany({
      data: [
        { branchId: branch.id, doctorId: doctorA.id, patientId: patient.id, dateTime: inWindow, duration: 30, status: "SCHEDULED" },
        { branchId: branch.id, doctorId: doctorA.id, patientId: patient.id, dateTime: outOfWindow, duration: 30, status: "SCHEDULED" },
      ],
    });

    const res = await GET(
      new Request(
        urlOf({
          branchId: branch.id,
          start: new Date(Date.now() - 60_000).toISOString(),
          end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.appointments).toHaveLength(1);
    expect(body.appointments[0].patient.firstName).toBe("Pat");
    expect(body.appointments[0].doctor.id).toBe(doctorA.id);
    expect(body.appointments[0].branch.id).toBe(branch.id);
    expect(typeof body.appointments[0].dateTime).toBe("string");
  });

  it("filters by doctorIds when provided (CSV)", async () => {
    const { owner, doctorA, doctorB, branch, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const t = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.appointment.createMany({
      data: [
        { branchId: branch.id, doctorId: doctorA.id, patientId: patient.id, dateTime: t, duration: 30, status: "SCHEDULED" },
        { branchId: branch.id, doctorId: doctorB.id, patientId: patient.id, dateTime: new Date(t.getTime() + 30 * 60_000), duration: 30, status: "SCHEDULED" },
      ],
    });

    const res = await GET(
      new Request(
        urlOf({
          branchId: branch.id,
          doctorIds: doctorA.id,
          start: new Date(Date.now() - 60_000).toISOString(),
          end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
      )
    );
    const body = await res.json();
    expect(body.appointments).toHaveLength(1);
    expect(body.appointments[0].doctor.id).toBe(doctorA.id);
  });

  it("excludes CANCELLED + NO_SHOW by default; includes them when includeCancelled=true", async () => {
    const { owner, doctorA, branch, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const t = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.appointment.createMany({
      data: [
        { branchId: branch.id, doctorId: doctorA.id, patientId: patient.id, dateTime: t, duration: 30, status: "SCHEDULED" },
        { branchId: branch.id, doctorId: doctorA.id, patientId: patient.id, dateTime: new Date(t.getTime() + 30 * 60_000), duration: 30, status: "CANCELLED" },
        { branchId: branch.id, doctorId: doctorA.id, patientId: patient.id, dateTime: new Date(t.getTime() + 60 * 60_000), duration: 30, status: "NO_SHOW" },
      ],
    });

    const qs = {
      branchId: branch.id,
      start: new Date(Date.now() - 60_000).toISOString(),
      end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const res1 = await GET(new Request(urlOf(qs)));
    const body1 = await res1.json();
    expect(body1.appointments).toHaveLength(1);

    const res2 = await GET(new Request(urlOf({ ...qs, includeCancelled: "true" })));
    const body2 = await res2.json();
    expect(body2.appointments).toHaveLength(3);
  });

  it("filters by ?tab=upcoming (excludes past + completed/cancelled/noshow)", async () => {
    const { owner, doctorA, branch, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.appointment.createMany({
      data: [
        { branchId: branch.id, doctorId: doctorA.id, patientId: patient.id, dateTime: future, duration: 30, status: "SCHEDULED" },
        { branchId: branch.id, doctorId: doctorA.id, patientId: patient.id, dateTime: new Date(future.getTime() + 30 * 60_000), duration: 30, status: "COMPLETED" },
      ],
    });

    const res = await GET(
      new Request(
        urlOf({
          branchId: branch.id,
          start: new Date(Date.now() - 60_000).toISOString(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          tab: "upcoming",
        })
      )
    );
    const body = await res.json();
    expect(body.appointments).toHaveLength(1);
    expect(body.appointments[0].status).toBe("SCHEDULED");
  });

  it("filters by ?tab=completed", async () => {
    const { owner, doctorA, branch, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.appointment.createMany({
      data: [
        { branchId: branch.id, doctorId: doctorA.id, patientId: patient.id, dateTime: future, duration: 30, status: "SCHEDULED" },
        { branchId: branch.id, doctorId: doctorA.id, patientId: patient.id, dateTime: new Date(future.getTime() + 30 * 60_000), duration: 30, status: "COMPLETED" },
        { branchId: branch.id, doctorId: doctorA.id, patientId: patient.id, dateTime: new Date(future.getTime() + 60 * 60_000), duration: 30, status: "CANCELLED" },
      ],
    });

    const res = await GET(
      new Request(
        urlOf({
          branchId: branch.id,
          start: new Date(Date.now() - 60_000).toISOString(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          tab: "completed",
        })
      )
    );
    const body = await res.json();
    expect(body.appointments).toHaveLength(1);
    expect(body.appointments[0].status).toBe("COMPLETED");
  });

  it("filters by ?tab=cancelled (overrides default exclude-cancelled)", async () => {
    const { owner, doctorA, branch, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.appointment.createMany({
      data: [
        { branchId: branch.id, doctorId: doctorA.id, patientId: patient.id, dateTime: future, duration: 30, status: "SCHEDULED" },
        { branchId: branch.id, doctorId: doctorA.id, patientId: patient.id, dateTime: new Date(future.getTime() + 30 * 60_000), duration: 30, status: "CANCELLED" },
      ],
    });

    const res = await GET(
      new Request(
        urlOf({
          branchId: branch.id,
          start: new Date(Date.now() - 60_000).toISOString(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          tab: "cancelled",
        })
      )
    );
    const body = await res.json();
    expect(body.appointments).toHaveLength(1);
    expect(body.appointments[0].status).toBe("CANCELLED");
  });

  it("returns 422 when window exceeds 500-event cap", async () => {
    const { owner, doctorA, branch, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const baseTime = Date.now() + 24 * 60 * 60 * 1000;
    // Insert 501 appointments spaced 1 hour apart
    const data = Array.from({ length: 501 }).map((_, i) => ({
      branchId: branch.id,
      doctorId: doctorA.id,
      patientId: patient.id,
      dateTime: new Date(baseTime + i * 60 * 60_000),
      duration: 30,
      status: "SCHEDULED" as const,
    }));
    await prisma.appointment.createMany({ data });

    const res = await GET(
      new Request(
        urlOf({
          branchId: branch.id,
          start: new Date(Date.now() - 60_000).toISOString(),
          end: new Date(baseTime + 600 * 60 * 60_000).toISOString(),
        })
      )
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("window_too_wide");
  });
});
