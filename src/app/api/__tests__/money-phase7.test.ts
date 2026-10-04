import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { clinicCalendar, clinicDateKey } from "@/lib/clinic-time";

// Bug-fix plan 2, Phase 7 (money).

vi.mock("@/lib/auth-utils", () => ({ getCurrentUser: vi.fn(), getUserBranchRole: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { auth } from "@/lib/auth";

const STAMP = Date.now().toString(36).toUpperCase();
const P = `test-money7-${STAMP}`;
let owner: string, branchId: string, patientId: string;

const asOwner = () => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: owner, email: `${owner}@t`, name: "Owner" } as never);
  vi.mocked(getUserBranchRole).mockResolvedValue("OWNER" as never);
  vi.mocked(auth).mockResolvedValue({ user: { id: owner } } as never);
};
const req = (method: string, body?: unknown) =>
  new Request("http://x", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

async function invoice(data: Record<string, unknown> = {}) {
  return prisma.invoice.create({
    data: {
      invoiceNumber: `INV-${P}-${Math.random().toString(36).slice(2, 8)}`,
      amount: 300,
      status: "SENT",
      lineItems: [{ description: "Adjustment", quantity: 1, unitPrice: 300, total: 300 }],
      patientId,
      branchId,
      ...data,
    } as Parameters<typeof prisma.invoice.create>[0]["data"],
  });
}

beforeAll(async () => {
  owner = (await prisma.user.create({ data: { email: `${P}-o@t.com`, name: "Owner" } })).id;
  branchId = (await prisma.branch.create({ data: { name: `${P} Branch`, invoicePrefix: `N${STAMP.slice(-7)}`, billingUserId: owner } })).id;
  await prisma.branchMember.create({ data: { userId: owner, branchId, role: "OWNER" } });
  patientId = (await prisma.patient.create({ data: { firstName: "Mei", lastName: P, branchId, doctorId: owner } })).id;
}, 30_000);

afterAll(async () => {
  await prisma.invoice.deleteMany({ where: { branch: { name: { startsWith: P } } } });
  await prisma.branch.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
});

describe("N1 — branches sharing initials keep invoicing", () => {
  it("a branch whose initials already have 60 invoices this year gets number 61, not a 409", async () => {
    const { createInvoice, formatDocumentNumber } = await import("@/lib/invoices");
    const prefix = `X${STAMP.slice(-6)}`;
    const [a, b] = await Promise.all(
      ["A", "B"].map((x) => prisma.branch.create({ data: { name: `${P} Same ${x}`, invoicePrefix: prefix } })),
    );
    const pa = await prisma.patient.create({ data: { firstName: "A", lastName: P, branchId: a.id, doctorId: owner } });
    const pb = await prisma.patient.create({ data: { firstName: "B", lastName: P, branchId: b.id, doctorId: owner } });
    const year = new Date().getFullYear();
    await prisma.invoice.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        invoiceNumber: formatDocumentNumber("invoice", prefix, year, i + 1),
        amount: 1,
        lineItems: [],
        patientId: pa.id,
        branchId: a.id,
      })),
    });
    await prisma.branch.update({ where: { id: a.id }, data: { invoiceSeq: 60 } });
    const inv = await prisma.$transaction((tx) =>
      createInvoice(tx, { branchId: b.id, patientId: pb.id, lines: [{ description: "x", quantity: 1, unitPrice: 10 }] }),
    );
    expect(inv.invoiceNumber).toBe(formatDocumentNumber("invoice", prefix, year, 61));
  }, 30_000);
});

describe("N2 / N3 — cancelling", () => {
  it("is refused while the invoice is on a submitted or valid e-invoice", async () => {
    asOwner();
    const inv = await invoice({ einvoiceStatus: "VALID" });
    const { PATCH } = await import("../invoices/[invoiceId]/route");
    const res = await PATCH(req("PATCH", { status: "CANCELLED" }), params({ invoiceId: inv.id }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("einvoice_active");
    const { POST: regenerate } = await import("../invoices/[invoiceId]/regenerate/route");
    expect((await regenerate(req("POST", {}), params({ invoiceId: inv.id }))).status).toBe(422);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("SENT");
  });

  it("an invoice that sold an active package is cancelled through the package, not directly", async () => {
    asOwner();
    const inv = await invoice({ amount: 900 });
    const pkg = await prisma.patientPackage.create({
      data: { patientId, branchId, name: "10 sessions", sessionsTotal: 10, price: 900, invoiceId: inv.id },
    });
    const { PATCH } = await import("../invoices/[invoiceId]/route");
    const res = await PATCH(req("PATCH", { status: "CANCELLED" }), params({ invoiceId: inv.id }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("package_sale");

    const { PATCH: cancelPackage } = await import("../patient-packages/[packageId]/route");
    const ok = await cancelPackage(req("PATCH", { status: "CANCELLED", reason: "Moved away", cancelInvoice: true }), params({ packageId: pkg.id }));
    expect(ok.status).toBe(200);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("CANCELLED");
  });
});

describe("N4 — payment dates", () => {
  it("a draft paid with yesterday's date is issued yesterday; an issued invoice refuses an earlier date", async () => {
    const { recordPayment } = await import("@/lib/invoices");
    const yesterday = new Date(Date.now() - 86_400_000);
    const draft = await invoice({ status: "DRAFT", issuedAt: new Date(Date.now() - 5 * 86_400_000), amount: 100 });
    await prisma.$transaction((tx) => recordPayment(tx, { invoiceId: draft.id, amount: 100, method: "CASH", receivedAt: yesterday }));
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: draft.id } })).issuedAt.getTime()).toBe(yesterday.getTime());

    const issued = await invoice({ issuedAt: new Date(), amount: 100 });
    await expect(
      prisma.$transaction((tx) => recordPayment(tx, { invoiceId: issued.id, amount: 50, method: "CASH", receivedAt: new Date(Date.now() - 3 * 86_400_000) })),
    ).rejects.toMatchObject({ code: "received_before_issue" });
  });
});

describe("N9 — a package that expired overnight still covers the visit before it", () => {
  it("completing yesterday's visit this morning uses yesterday's package", async () => {
    asOwner();
    await prisma.patientPackage.updateMany({ where: { patientId }, data: { status: "CANCELLED" } });
    const visitAt = new Date(Date.now() - 14 * 3600_000);
    await prisma.patientPackage.create({
      data: {
        patientId, branchId, name: "Expired pack", sessionsTotal: 5, price: 500,
        status: "EXPIRED", expiresAt: new Date(Date.now() - 6 * 3600_000),
      },
    });
    const appt = await prisma.appointment.create({
      data: { patientId, branchId, doctorId: owner, dateTime: visitAt, status: "IN_PROGRESS" },
    });
    const { redeemAppointment } = await import("@/lib/package-service");
    const result = await redeemAppointment({ appointmentId: appt.id, actor: null });
    expect(result).toMatchObject({ ok: true });
    await prisma.patientPackage.updateMany({ where: { patientId }, data: { status: "CANCELLED" } });
  });
});

describe("N6 / N7 — commissions", () => {
  it("a completed appointment and an unlinked visit that day count once; payments count net of SST", async () => {
    asOwner();
    const longAgo = new Date("2020-01-01T00:00:00Z");
    const rule = await prisma.commissionRule.create({
      data: { branchId, basis: "FIXED_PER_VISIT", rate: 40, effectiveFrom: longAgo },
    });
    const at = clinicCalendar().dayStart;
    const appt = await prisma.appointment.create({
      data: { patientId, branchId, doctorId: owner, dateTime: new Date(at.getTime() + 2 * 3600_000), status: "COMPLETED" },
    });
    await prisma.visit.create({ data: { patientId, doctorId: owner, visitDate: new Date(at.getTime() + 3 * 3600_000) } });
    const inv = await invoice({ amount: 106, subtotal: 100, taxRate: 6, taxAmount: 6, appointmentId: appt.id, issuedAt: at });
    await prisma.payment.create({
      data: { invoiceId: inv.id, branchId, amount: 106, method: "CASH", receiptNumber: `RCP-${P}-1`, receivedAt: new Date(at.getTime() + 4 * 3600_000) },
    });
    const today = clinicDateKey(at);
    const report = async () => {
      const res = await GET(new Request(`http://x/api/reports/commissions?branchId=${branchId}&from=${today}&to=${today}`));
      return (await res.json()).rows.find((r: { userId: string }) => r.userId === owner);
    };
    const { GET } = await import("../reports/commissions/route");
    const perVisit = await report();
    expect(perVisit.visits).toBe(1);
    expect(perVisit.total).toBeCloseTo(40, 2); // one visit, not two

    await prisma.commissionRule.update({ where: { id: rule.id }, data: { basis: "PERCENT_COLLECTED", rate: 30 } });
    const percent = await report();
    expect(percent.collected).toBeCloseTo(100, 2); // RM106 paid, RM6 of it SST
    expect(percent.total).toBeCloseTo(30, 2);
  });
});
