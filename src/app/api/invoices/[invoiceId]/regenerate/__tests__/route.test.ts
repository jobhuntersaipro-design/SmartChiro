import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

const TEST_PREFIX = "test-regen-";

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

async function buildFixture(invoiceStatus: "DRAFT" | "PAID" | "SENT") {
  const stamp = Date.now() + Math.floor(Math.random() * 100000);
  const owner = await prisma.user.create({
    data: { email: `${TEST_PREFIX}o-${stamp}@t`, name: "O" },
  });
  const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${stamp}` } });
  await prisma.branchMember.create({ data: { userId: owner.id, branchId: branch.id, role: "OWNER" } });
  const patient = await prisma.patient.create({
    data: { firstName: "P", lastName: "X", branchId: branch.id, doctorId: owner.id },
  });
  const appt = await prisma.appointment.create({
    data: {
      dateTime: new Date(Date.now() - 24 * 3600 * 1000),
      status: "COMPLETED",
      patientId: patient.id,
      branchId: branch.id,
      doctorId: owner.id,
    },
  });
  const lineItems = [{ description: "Original", quantity: 1, unitPrice: 200, total: 200 }];
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: `${TEST_PREFIX}INV-${stamp}-1`,
      amount: 200,
      status: invoiceStatus,
      lineItems,
      patientId: patient.id,
      branchId: branch.id,
      appointmentId: appt.id,
    },
  });
  return { ownerId: owner.id, branchId: branch.id, invoiceId: invoice.id, appointmentId: appt.id };
}

function req() {
  return new Request("http://x", { method: "POST", body: JSON.stringify({}) });
}

describe("POST /api/invoices/:id/regenerate", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  it("DRAFT invoice → marks original CANCELLED, creates new DRAFT with same lineItems + appointmentId", async () => {
    const fx = await buildFixture("DRAFT");
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.ownerId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const res = await POST(req(), {
      params: Promise.resolve({ invoiceId: fx.invoiceId }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.invoice).toBeDefined();
    expect(data.invoice.id).not.toBe(fx.invoiceId);
    expect(data.invoice.status).toBe("DRAFT");
    expect(data.invoice.appointmentId).toBe(fx.appointmentId);

    const original = await prisma.invoice.findUnique({ where: { id: fx.invoiceId } });
    expect(original?.status).toBe("CANCELLED");

    const fresh = await prisma.invoice.findUnique({ where: { id: data.invoice.id } });
    expect(fresh).not.toBeNull();
    expect(fresh?.appointmentId).toBe(fx.appointmentId);
    const items = fresh?.lineItems as unknown as Array<{ description: string }>;
    expect(items[0].description).toBe("Original");
  });

  it("PAID invoice → 422 invoice_already_paid", async () => {
    const fx = await buildFixture("PAID");
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.ownerId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const res = await POST(req(), {
      params: Promise.resolve({ invoiceId: fx.invoiceId }),
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe("invoice_already_paid");

    // original must remain PAID, no new invoice created
    const original = await prisma.invoice.findUnique({ where: { id: fx.invoiceId } });
    expect(original?.status).toBe("PAID");
    const all = await prisma.invoice.findMany({ where: { branchId: fx.branchId } });
    expect(all).toHaveLength(1);
  });
});
