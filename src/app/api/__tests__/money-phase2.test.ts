import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

// Bug-fix plan, Phase 2 (money): no double charging, every issued invoice
// reaches the books, cancels can't strand money, billing follows ownership.

vi.mock("@/lib/auth-utils", () => ({ getCurrentUser: vi.fn(), getUserBranchRole: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { auth } from "@/lib/auth";

const STAMP = Date.now().toString(36).toUpperCase();
const P = `test-money2-${STAMP}`;
let owner: string, other: string, branchId: string, patientId: string;

const asOwner = (id = owner) => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id, email: `${id}@t`, name: "Owner" } as never);
  vi.mocked(getUserBranchRole).mockResolvedValue("OWNER" as never);
  vi.mocked(auth).mockResolvedValue({ user: { id, email: `${id}@t`, name: "Owner" } } as never);
};
const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const patch = (body: unknown) => new Request("http://x", { method: "PATCH", body: JSON.stringify(body) });
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

async function invoice(data: Partial<Parameters<typeof prisma.invoice.create>[0]["data"]> = {}) {
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
  other = (await prisma.user.create({ data: { email: `${P}-x@t.com`, name: "New owner" } })).id;
  branchId = (await prisma.branch.create({ data: { name: `${P} Branch`, invoicePrefix: `M${STAMP.slice(-7)}`, billingUserId: owner } })).id;
  await prisma.branchMember.createMany({
    data: [
      { userId: owner, branchId, role: "OWNER" },
      { userId: other, branchId, role: "ADMIN" },
    ],
  });
  patientId = (await prisma.patient.create({ data: { firstName: "Mei", lastName: P, branchId, doctorId: owner } })).id;
}, 30_000);

afterAll(async () => {
  await prisma.invoice.deleteMany({ where: { branchId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
});

describe("M1 / M9 — package-covered visits", () => {
  it("a visit paid by a package can't be invoiced; undoing Completed gives the session back", async () => {
    asOwner();
    const pkg = await prisma.patientPackage.create({ data: { patientId, branchId, name: "10 sessions", sessionsTotal: 10, price: 900 } });
    const appt = await prisma.appointment.create({
      data: { patientId, branchId, doctorId: owner, dateTime: new Date(Date.now() - 3600_000), status: "IN_PROGRESS" },
    });
    const { PATCH } = await import("../appointments/[appointmentId]/route");
    expect((await PATCH(patch({ status: "COMPLETED" }), params({ appointmentId: appt.id }))).status).toBe(200);
    expect((await prisma.patientPackage.findUniqueOrThrow({ where: { id: pkg.id } })).sessionsUsed).toBe(1);

    const { POST: issue } = await import("../appointments/[appointmentId]/invoice/route");
    const res = await issue(post({ amount: 100 }), params({ appointmentId: appt.id }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("package_covered");
    const { POST: manual } = await import("../invoices/route");
    const res2 = await manual(post({ patientId, appointmentId: appt.id, lines: [{ description: "x", quantity: 1, unitPrice: 100 }] }));
    expect(res2.status).toBe(409);

    // The past-appointments table shows "Package" instead of "+ Issue"
    vi.mocked(auth).mockResolvedValue({ user: { id: owner } } as never);
    const { GET: past } = await import("../patients/[patientId]/past-appointments/route");
    const rows = (await (await past(new Request("http://x"), params({ patientId }))).json()).appointments;
    expect(rows.find((r: { id: string }) => r.id === appt.id).packageCovered).toBe(true);

    // Back to In progress → the session is returned
    expect((await PATCH(patch({ status: "IN_PROGRESS" }), params({ appointmentId: appt.id }))).status).toBe(200);
    expect((await prisma.patientPackage.findUniqueOrThrow({ where: { id: pkg.id } })).sessionsUsed).toBe(0);
    expect(await prisma.packageRedemption.count({ where: { appointmentId: appt.id, reversedAt: null } })).toBe(0);
    await prisma.patientPackage.update({ where: { id: pkg.id }, data: { status: "CANCELLED" } });
  });
});

describe("M2 — cancelling a package with money on its invoice", () => {
  it("is refused until the payment is refunded", async () => {
    asOwner();
    const inv = await invoice({ amount: 900, amountPaid: 300, status: "PARTIALLY_PAID" });
    const pkg = await prisma.patientPackage.create({
      data: { patientId, branchId, name: "Pack", sessionsTotal: 10, price: 900, invoiceId: inv.id },
    });
    const { PATCH } = await import("../patient-packages/[packageId]/route");
    const res = await PATCH(patch({ status: "CANCELLED", reason: "Moved away", cancelInvoice: true }), params({ packageId: pkg.id }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("invoice_has_payments");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PARTIALLY_PAID");
    expect((await prisma.patientPackage.findUniqueOrThrow({ where: { id: pkg.id } })).status).toBe("ACTIVE");
  });
});

describe("M3 — a draft is issued when first sent or paid", () => {
  it("sending moves the issue date to today", async () => {
    asOwner();
    const old = new Date(Date.now() - 20 * 86_400_000);
    const draft = await invoice({ status: "DRAFT", issuedAt: old });
    const { PATCH } = await import("../invoices/[invoiceId]/route");
    expect((await PATCH(patch({ status: "SENT" }), params({ invoiceId: draft.id }))).status).toBe(200);
    const sent = await prisma.invoice.findUniqueOrThrow({ where: { id: draft.id } });
    expect(Date.now() - sent.issuedAt.getTime()).toBeLessThan(60_000);
  });

  it("paying a draft issues it too; a draft from last year gets this year's number", async () => {
    asOwner();
    const lastYear = new Date(Date.now() - 400 * 86_400_000);
    const draft = await invoice({ status: "DRAFT", issuedAt: lastYear, amount: 100 });
    const { POST } = await import("../invoices/[invoiceId]/payments/route");
    expect((await POST(post({ amount: 100, method: "CASH" }), params({ invoiceId: draft.id }))).status).toBe(201);
    const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: draft.id } });
    expect(paid.status).toBe("PAID");
    expect(Date.now() - paid.issuedAt.getTime()).toBeLessThan(60_000);
    expect(paid.invoiceNumber).not.toBe(draft.invoiceNumber);
    expect(paid.invoiceNumber).toContain(String(new Date().getFullYear()));
  });
});

describe("M4 / M10 — regenerate and cancel", () => {
  it("regenerate refuses a cancelled invoice", async () => {
    asOwner();
    const inv = await invoice({ status: "CANCELLED", cancelledAt: new Date() });
    const { POST } = await import("../invoices/[invoiceId]/regenerate/route");
    const res = await POST(post({}), params({ invoiceId: inv.id }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("invoice_cancelled");
    expect(await prisma.invoice.count({ where: { branchId, status: "DRAFT", patientId, appointmentId: null, amount: 300, createdAt: { gt: inv.createdAt } } })).toBe(0);
  });

  it("the locked cancel re-checks for a payment that landed after the route's read", async () => {
    const { cancelInvoiceLocked, InvoiceError } = await import("@/lib/invoices");
    const inv = await invoice({ amountPaid: 50, status: "PARTIALLY_PAID" });
    await expect(prisma.$transaction((tx) => cancelInvoiceLocked(tx, inv.id))).rejects.toBeInstanceOf(InvoiceError);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PARTIALLY_PAID");
  });
});

describe("M7 — ownership transfer moves billing", () => {
  it("the new owner becomes the branch's billing account", async () => {
    asOwner();
    vi.mocked(auth).mockResolvedValue({ user: { id: owner } } as never);
    const member = await prisma.branchMember.findFirstOrThrow({ where: { userId: other, branchId } });
    const { PATCH } = await import("../branches/[branchId]/members/[memberId]/route");
    const res = await PATCH(
      new (await import("next/server")).NextRequest("http://x", { method: "PATCH", body: JSON.stringify({ role: "OWNER" }) }),
      params({ branchId, memberId: member.id }),
    );
    expect(res.status).toBe(200);
    expect((await prisma.branch.findUniqueOrThrow({ where: { id: branchId } })).billingUserId).toBe(other);
  });
});

describe("M8 — past-appointment totals count partly paid invoices", () => {
  it("paid sums payments, outstanding sums what's still owed", async () => {
    await prisma.invoice.deleteMany({ where: { patientId } });
    await invoice({ amount: 300, amountPaid: 100, status: "PARTIALLY_PAID" });
    await invoice({ amount: 50, amountPaid: 50, status: "PAID" });
    await invoice({ amount: 80, status: "CANCELLED" });
    vi.mocked(auth).mockResolvedValue({ user: { id: other } } as never);
    vi.mocked(getCurrentUser).mockResolvedValue({ id: other } as never);
    const { GET } = await import("../patients/[patientId]/past-appointments/route");
    const { stats } = await (await GET(new Request("http://x"), params({ patientId }))).json();
    expect(stats.paid).toBe(150);
    expect(stats.outstanding).toBe(200);
  });
});

describe("M11 — branches sharing initials don't collide on invoice numbers", () => {
  it("concurrent invoices in two branches with the same prefix get distinct numbers", async () => {
    const { createInvoice } = await import("@/lib/invoices");
    const prefix = `D${STAMP.slice(-6)}`;
    const [a, b] = await Promise.all(
      ["A", "B"].map((x) => prisma.branch.create({ data: { name: `${P} Dup ${x}`, invoicePrefix: prefix } })),
    );
    const pa = await prisma.patient.create({ data: { firstName: "A", lastName: P, branchId: a.id, doctorId: owner } });
    const pb = await prisma.patient.create({ data: { firstName: "B", lastName: P, branchId: b.id, doctorId: owner } });
    const make = (branch: string, patient: string) =>
      prisma.$transaction((tx) => createInvoice(tx, { branchId: branch, patientId: patient, lines: [{ description: "x", quantity: 1, unitPrice: 10 }] }));
    const created = await Promise.all([make(a.id, pa.id), make(b.id, pb.id), make(a.id, pa.id), make(b.id, pb.id)]);
    expect(new Set(created.map((i) => i.invoiceNumber)).size).toBe(4);
    await prisma.invoice.deleteMany({ where: { branchId: { in: [a.id, b.id] } } });
    await prisma.branch.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }, 30_000);
});
