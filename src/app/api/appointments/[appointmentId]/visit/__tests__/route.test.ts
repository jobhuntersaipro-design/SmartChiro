import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

const TEST_PREFIX = "test-apptvisit-";

async function cleanup() {
  await prisma.visit.deleteMany({
    where: { patient: { branch: { name: { startsWith: TEST_PREFIX } } } },
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

async function buildFixture(opts?: { status?: "COMPLETED" | "SCHEDULED" | "CANCELLED" }) {
  const stamp = Date.now() + Math.floor(Math.random() * 100000);
  const owner = await prisma.user.create({
    data: { email: `${TEST_PREFIX}o-${stamp}@t`, name: "O" },
  });
  const admin = await prisma.user.create({
    data: { email: `${TEST_PREFIX}a-${stamp}@t`, name: "A" },
  });
  const doctor = await prisma.user.create({
    data: { email: `${TEST_PREFIX}d-${stamp}@t`, name: "D" },
  });
  const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${stamp}` } });
  await prisma.branchMember.create({ data: { userId: owner.id, branchId: branch.id, role: "OWNER" } });
  await prisma.branchMember.create({ data: { userId: admin.id, branchId: branch.id, role: "ADMIN" } });
  await prisma.branchMember.create({ data: { userId: doctor.id, branchId: branch.id, role: "DOCTOR" } });

  const patient = await prisma.patient.create({
    data: { firstName: "P", lastName: "X", branchId: branch.id, doctorId: doctor.id },
  });
  const appt = await prisma.appointment.create({
    data: {
      dateTime: new Date(Date.now() - 24 * 3600 * 1000),
      status: opts?.status ?? "COMPLETED",
      patientId: patient.id,
      branchId: branch.id,
      doctorId: doctor.id,
    },
  });
  return { ownerId: owner.id, adminId: admin.id, doctorId: doctor.id, branchId: branch.id, patientId: patient.id, appointmentId: appt.id };
}

function req(body?: object) {
  return new Request("http://x", {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

describe("POST /api/appointments/:id/visit", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  it("creates a Visit linked to a COMPLETED appointment", async () => {
    const fx = await buildFixture({ status: "COMPLETED" });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.ownerId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const res = await POST(req({ visitType: "follow_up", chiefComplaint: "Lower back pain" }), {
      params: Promise.resolve({ appointmentId: fx.appointmentId }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.visit).toBeDefined();
    expect(data.visit.appointmentId).toBe(fx.appointmentId);
    expect(data.visit.patientId).toBe(fx.patientId);
    expect(data.visit.doctorId).toBe(fx.doctorId);

    const dbVisit = await prisma.visit.findUnique({ where: { appointmentId: fx.appointmentId } });
    expect(dbVisit).not.toBeNull();
    expect(dbVisit?.visitType).toBe("follow_up");
  });

  it("idempotent: already linked → returns existing Visit, no duplicate created", async () => {
    const fx = await buildFixture({ status: "COMPLETED" });
    const existing = await prisma.visit.create({
      data: {
        patientId: fx.patientId,
        doctorId: fx.doctorId,
        appointmentId: fx.appointmentId,
        visitDate: new Date(Date.now() - 24 * 3600 * 1000),
        visitType: "initial",
      },
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.adminId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("ADMIN");

    const res = await POST(req({ visitType: "follow_up" }), {
      params: Promise.resolve({ appointmentId: fx.appointmentId }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.visit.id).toBe(existing.id);
    // visitType should remain the original — no overwrite
    expect(data.visit.visitType).toBe("initial");

    const allVisits = await prisma.visit.findMany({ where: { appointmentId: fx.appointmentId } });
    expect(allVisits).toHaveLength(1);
  });

  it("non-COMPLETED appointment → 422 appointment_not_completed", async () => {
    const fx = await buildFixture({ status: "SCHEDULED" });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.ownerId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const res = await POST(req(), {
      params: Promise.resolve({ appointmentId: fx.appointmentId }),
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe("appointment_not_completed");
  });

  it("DOCTOR → 403", async () => {
    const fx = await buildFixture({ status: "COMPLETED" });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.doctorId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("DOCTOR");

    const res = await POST(req(), {
      params: Promise.resolve({ appointmentId: fx.appointmentId }),
    });
    expect(res.status).toBe(403);
  });
});
