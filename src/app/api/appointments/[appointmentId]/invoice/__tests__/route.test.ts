import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

const TEST_PREFIX = "test-apptinv-";

async function cleanup() {
  await prisma.invoice.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
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

async function buildFixture(opts?: { status?: "COMPLETED" | "SCHEDULED" }) {
  const stamp = Date.now() + Math.floor(Math.random() * 100000);
  const owner = await prisma.user.create({
    data: { email: `${TEST_PREFIX}o-${stamp}@t`, name: "O" },
  });
  const doctor = await prisma.user.create({
    data: { email: `${TEST_PREFIX}d-${stamp}@t`, name: "D" },
  });
  const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${stamp}` } });
  await prisma.branchMember.create({ data: { userId: owner.id, branchId: branch.id, role: "OWNER" } });
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
  return { ownerId: owner.id, doctorId: doctor.id, branchId: branch.id, patientId: patient.id, appointmentId: appt.id };
}

function req(body: object) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/appointments/:id/invoice", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  it("defaults: omitting lineItems generates a single line item", async () => {
    const fx = await buildFixture({ status: "COMPLETED" });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.ownerId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const res = await POST(req({ amount: 200 }), {
      params: Promise.resolve({ appointmentId: fx.appointmentId }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.invoice).toBeDefined();
    expect(data.invoice.amount).toBe(200);
    expect(data.invoice.appointmentId).toBe(fx.appointmentId);
    expect(Array.isArray(data.invoice.lineItems)).toBe(true);
    expect(data.invoice.lineItems).toHaveLength(1);
    expect(data.invoice.lineItems[0].description).toContain("Treatment");
  });

  it("multiple invoices per appointment allowed", async () => {
    const fx = await buildFixture({ status: "COMPLETED" });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.ownerId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const r1 = await POST(req({ amount: 100 }), {
      params: Promise.resolve({ appointmentId: fx.appointmentId }),
    });
    expect(r1.status).toBe(201);
    const r2 = await POST(req({ amount: 50 }), {
      params: Promise.resolve({ appointmentId: fx.appointmentId }),
    });
    expect(r2.status).toBe(201);

    const dbInvoices = await prisma.invoice.findMany({
      where: { appointmentId: fx.appointmentId },
    });
    expect(dbInvoices).toHaveLength(2);
    // numbers must be unique
    const numbers = dbInvoices.map((i) => i.invoiceNumber);
    expect(new Set(numbers).size).toBe(2);
  });

  it("non-COMPLETED → 422 appointment_not_completed", async () => {
    const fx = await buildFixture({ status: "SCHEDULED" });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.ownerId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const res = await POST(req({ amount: 200 }), {
      params: Promise.resolve({ appointmentId: fx.appointmentId }),
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe("appointment_not_completed");
  });
});
