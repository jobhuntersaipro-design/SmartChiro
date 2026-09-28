import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

const STAMP = Date.now().toString(36).toUpperCase();
const PREFIX = `test-payments-${STAMP}`;
// Invoice numbers are globally unique, so give the test branch its own prefix.
const INV_PREFIX = `T${STAMP.slice(-7)}`;
let branchId: string, userId: string, foreignId: string, localId: string;

type Role = "OWNER" | "ADMIN" | "DOCTOR" | null;
const as = (role: Role) => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: userId } as never);
  vi.mocked(getUserBranchRole).mockResolvedValue(role as never);
};
const json = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

async function createInvoice(body: Record<string, unknown>) {
  const { POST } = await import("../route");
  return POST(json(body));
}
async function pay(invoiceId: string, body: Record<string, unknown>) {
  const { POST } = await import("../[invoiceId]/payments/route");
  return POST(json(body), params({ invoiceId }));
}
async function detail(invoiceId: string) {
  const { GET } = await import("../[invoiceId]/route");
  return GET(new Request("http://x"), params({ invoiceId }));
}
async function newInvoice(patientId: string, unitPrice: number) {
  as("OWNER");
  const res = await createInvoice({ patientId, lines: [{ description: "Adjustment", quantity: 1, unitPrice }] });
  expect(res.status).toBe(201);
  return (await res.json()).invoice as { id: string; invoiceNumber: string; total: number };
}

describe("payments, manual invoices and SST", () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `${PREFIX}@t.com`, name: "Front Desk" } });
    userId = u.id;
    const b = await prisma.branch.create({
      data: { name: `${PREFIX} Branch`, invoicePrefix: INV_PREFIX, sstEnabled: true, sstRate: 6, legalName: "Test Chiro Sdn Bhd", ssmRegNo: "202401000001", tin: "C1234567890", sstRegNo: "W10-1234-56789012" },
    });
    branchId = b.id;
    const foreign = await prisma.patient.create({
      data: { firstName: "John", lastName: `${PREFIX}-sg`, nationality: "SG", branchId, doctorId: userId },
    });
    foreignId = foreign.id;
    const local = await prisma.patient.create({
      data: { firstName: "Siti", lastName: `${PREFIX}-my`, icNumber: `880412-14-${String(Date.now()).slice(-4)}`, branchId, doctorId: userId },
    });
    localId = local.id;
  });

  beforeEach(() => vi.clearAllMocks());

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { branchId } });
    await prisma.patient.deleteMany({ where: { branchId } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("charges 6% SST on taxable lines for a foreign patient and none for a Malaysian", async () => {
    as("ADMIN");
    const lines = [
      { description: "Adjustment", quantity: 1, unitPrice: 150 },
      { description: "Cervical pillow", quantity: 1, unitPrice: 80, taxable: false },
    ];
    const foreign = await createInvoice({ patientId: foreignId, lines, dueDate: "2026-10-15", status: "SENT" });
    expect(foreign.status).toBe(201);
    const f = (await foreign.json()).invoice;
    expect(f).toMatchObject({ subtotal: 230, taxRate: 6, taxAmount: 9, taxLabel: "SST 6%", total: 239, amount: 239, amountPaid: 0, balance: 239, status: "SENT" });
    expect(f.invoiceNumber).toMatch(new RegExp(`^INV-${INV_PREFIX}-\\d{4}-\\d{5}$`));
    expect(f.patient.isMalaysian).toBe(false);
    expect(f.branch).toMatchObject({ legalName: "Test Chiro Sdn Bhd", sstRegNo: "W10-1234-56789012" });

    const local = await createInvoice({ patientId: localId, lines });
    const l = (await local.json()).invoice;
    expect(l).toMatchObject({ subtotal: 230, taxRate: null, taxAmount: 0, total: 230, status: "DRAFT" });
    expect(l.patient.isMalaysian).toBe(true);

    const stored = await prisma.invoice.findUnique({ where: { id: f.id } });
    expect(Number(stored!.amount)).toBe(239);
    expect(Number(stored!.subtotal)).toBe(230);
    expect(Number(stored!.taxAmount)).toBe(9);
  });

  it("validates manual invoices and keeps them to the patient's branch", async () => {
    as("OWNER");
    expect((await createInvoice({ patientId: localId, lines: [] })).status).toBe(422);
    expect((await createInvoice({ patientId: localId, lines: [{ description: "x", quantity: 1, unitPrice: -5 }] })).status).toBe(422);
    expect((await createInvoice({ patientId: localId, branchId: "someone-elses-branch", lines: [{ description: "x", quantity: 1, unitPrice: 5 }] })).status).toBe(422);
    as("DOCTOR");
    expect((await createInvoice({ patientId: localId, lines: [{ description: "x", quantity: 1, unitPrice: 5 }] })).status).toBe(403);
    as(null);
    expect((await createInvoice({ patientId: localId, lines: [{ description: "x", quantity: 1, unitPrice: 5 }] })).status).toBe(404);
  });

  it("split payment (cash + DuitNow) → two receipts and a PAID invoice", async () => {
    const inv = await newInvoice(foreignId, 100); // 100 + 6% = 106
    expect(inv.total).toBe(106);

    as("ADMIN");
    const first = await pay(inv.id, { amount: 50, method: "CASH" });
    expect(first.status).toBe(201);
    const a = await first.json();
    expect(a.invoice).toMatchObject({ status: "PARTIALLY_PAID", amountPaid: 50, balance: 56, paidAt: null });
    expect(a.payment.receiptNumber).toMatch(new RegExp(`^RCP-${INV_PREFIX}-\\d{4}-\\d{5}$`));

    const second = await pay(inv.id, { amount: 56, method: "DUITNOW_QR", reference: "DN123456", receivedAt: "2026-09-28" });
    expect(second.status).toBe(201);
    const b = await second.json();
    expect(b.invoice).toMatchObject({ status: "PAID", amountPaid: 106, balance: 0 });
    expect(b.invoice.paidAt).not.toBeNull();
    expect(b.payment).toMatchObject({ method: "DUITNOW_QR", methodLabel: "DuitNow QR", reference: "DN123456" });
    expect(b.payment.receiptNumber).not.toBe(a.payment.receiptNumber);

    as("DOCTOR"); // read-only access to the detail
    const d = await (await detail(inv.id)).json();
    expect(d.invoice.payments).toHaveLength(2);

    const { GET } = await import("../[invoiceId]/payments/[paymentId]/receipt/route");
    const pdf = await GET(new Request("http://x"), params({ invoiceId: inv.id, paymentId: b.payment.id }));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(pdf.headers.get("Content-Disposition")).toContain(b.payment.receiptNumber);
    expect(new TextDecoder().decode(new Uint8Array(await pdf.arrayBuffer()).slice(0, 5))).toBe("%PDF-");

    const missing = await GET(new Request("http://x"), params({ invoiceId: inv.id, paymentId: "nope" }));
    expect(missing.status).toBe(404);

    const { GET: invoicePdf } = await import("../[invoiceId]/pdf/route");
    const full = await invoicePdf(new Request("http://x"), params({ invoiceId: inv.id }));
    expect(full.headers.get("Content-Disposition")).toContain("receipt-");
  });

  it("rejects overpayment and payments on cancelled invoices (422)", async () => {
    const inv = await newInvoice(localId, 100);
    as("OWNER");
    const over = await pay(inv.id, { amount: 100.01, method: "CARD" });
    expect(over.status).toBe(422);
    expect(await over.json()).toMatchObject({ error: "overpayment", balance: 100 });

    expect((await pay(inv.id, { amount: 0, method: "CASH" })).status).toBe(422);
    expect((await pay(inv.id, { amount: 10, method: "CHEQUE" })).status).toBe(422);
    expect((await pay(inv.id, { amount: 10, method: "CASH", receivedAt: "2999-01-01" })).status).toBe(422);

    await prisma.invoice.update({ where: { id: inv.id }, data: { status: "CANCELLED" } });
    const cancelled = await pay(inv.id, { amount: 10, method: "CASH" });
    expect(cancelled.status).toBe(422);
    expect((await cancelled.json()).error).toBe("invoice_cancelled");
    expect(await prisma.payment.count({ where: { invoiceId: inv.id } })).toBe(0);
  });

  it("refunds: OWNER/ADMIN only, need a reason, can't exceed what was paid", async () => {
    const inv = await newInvoice(localId, 120);
    as("ADMIN");
    expect((await pay(inv.id, { amount: 120, method: "CARD", reference: "4242" })).status).toBe(201);

    as("DOCTOR");
    expect((await pay(inv.id, { amount: 10, method: "CASH" })).status).toBe(403);
    expect((await pay(inv.id, { amount: -20, method: "CARD", refundReason: "Goodwill" })).status).toBe(403);
    as(null);
    expect((await pay(inv.id, { amount: -20, method: "CARD", refundReason: "Goodwill" })).status).toBe(404);

    as("ADMIN");
    expect((await pay(inv.id, { amount: -20, method: "CARD" })).status).toBe(422);
    expect((await pay(inv.id, { amount: -500, method: "CARD", refundReason: "Too much" })).status).toBe(422);

    const refund = await pay(inv.id, { amount: -20, method: "CARD", refundReason: "Session cut short" });
    expect(refund.status).toBe(201);
    const r = await refund.json();
    expect(r.payment).toMatchObject({ amount: -20, isRefund: true, refundReason: "Session cut short" });
    expect(r.invoice).toMatchObject({ status: "PARTIALLY_PAID", amountPaid: 100, balance: 20, paidAt: null });

    as("OWNER");
    const all = await pay(inv.id, { amount: -100, method: "CARD", refundReason: "Treatment cancelled" });
    expect((await all.json()).invoice).toMatchObject({ status: "SENT", amountPaid: 0 });

    const { GET } = await import("../[invoiceId]/payments/[paymentId]/receipt/route");
    const pdf = await GET(new Request("http://x"), params({ invoiceId: inv.id, paymentId: r.payment.id }));
    expect(pdf.status).toBe(200);
  });

  it("PATCH mark paid records a payment for the balance (default cash)", async () => {
    const { PATCH } = await import("../[invoiceId]/route");
    const patch = (id: string, body: Record<string, unknown>) =>
      PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }), params({ invoiceId: id }));

    const inv = await newInvoice(foreignId, 200); // 212
    as("OWNER");
    expect((await pay(inv.id, { amount: 12, method: "EWALLET" })).status).toBe(201);
    const res = await patch(inv.id, { status: "PAID" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invoice).toMatchObject({ status: "PAID", amountPaid: 212, balance: 0 });
    expect(body.payment).toMatchObject({ amount: 200, method: "CASH" });

    const other = await newInvoice(localId, 90);
    as("ADMIN");
    const card = await (await patch(other.id, { status: "PAID", method: "CARD", reference: "1234" })).json();
    expect(card.payment).toMatchObject({ amount: 90, method: "CARD", reference: "1234" });

    // Money taken → cancelling needs a refund first.
    const partial = await newInvoice(localId, 50);
    as("OWNER");
    await pay(partial.id, { amount: 20, method: "CASH" });
    expect((await patch(partial.id, { status: "CANCELLED" })).status).toBe(422);
  });

  it("hands out unique, consecutive invoice numbers under concurrent creation", async () => {
    as("OWNER");
    const before = await prisma.branch.findUnique({ where: { id: branchId }, select: { invoiceSeq: true } });
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createInvoice({ patientId: localId, lines: [{ description: `Visit ${i}`, quantity: 1, unitPrice: 60 }] }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const numbers: string[] = await Promise.all(results.map(async (r) => (await r.json()).invoice.invoiceNumber));
    expect(new Set(numbers).size).toBe(5);
    const seqs = numbers.map((n) => Number(n.split("-").pop())).sort((a, b) => a - b);
    const start = before!.invoiceSeq + 1;
    expect(seqs).toEqual([start, start + 1, start + 2, start + 3, start + 4]);
  });

  it("serialises concurrent payments so the invoice is never overpaid", async () => {
    const inv = await newInvoice(localId, 100);
    as("OWNER");
    const results = await Promise.all([60, 60, 60].map((amount) => pay(inv.id, { amount, method: "CASH" })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 422, 422]);
    const stored = await prisma.invoice.findUnique({ where: { id: inv.id } });
    expect(Number(stored!.amountPaid)).toBe(60);
  });
});

describe("branch billing settings", () => {
  let ownerBranchId: string, uid: string;
  beforeAll(async () => {
    uid = (await prisma.user.create({ data: { email: `${PREFIX}-billing@t.com` } })).id;
    ownerBranchId = (await prisma.branch.create({ data: { name: "Bangsar Spine Centre" } })).id;
  });
  afterAll(async () => {
    await prisma.branch.deleteMany({ where: { id: ownerBranchId } });
    await prisma.user.deleteMany({ where: { id: uid } });
  });

  const put = async (body: unknown) => {
    const { PUT } = await import("../../branches/[branchId]/billing/route");
    return PUT(new Request("http://x", { method: "PUT", body: JSON.stringify(body) }), params({ branchId: ownerBranchId }));
  };
  const get = async () => {
    const { GET } = await import("../../branches/[branchId]/billing/route");
    return GET(new Request("http://x"), params({ branchId: ownerBranchId }));
  };
  const asRole = (role: Role) => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: uid } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue(role as never);
  };

  it("OWNER edits, ADMIN reads, others are kept out", async () => {
    asRole("ADMIN");
    const read = await (await get()).json();
    expect(read.billing).toMatchObject({ sstEnabled: false, sstRate: 6, effectivePrefix: "BSC" });
    expect(read.canEdit).toBe(false);
    expect(read.billing.nextInvoiceNumber).toMatch(/^INV-BSC-\d{4}-00001$/);
    expect((await put({ sstEnabled: true })).status).toBe(403);

    asRole("OWNER");
    const res = await put({ legalName: "Bangsar Spine Sdn Bhd", sstEnabled: true, sstRate: 8, invoicePrefix: "bsx", paymentInstructions: "Maybank 5123 4567 8901" });
    expect(res.status).toBe(200);
    expect((await res.json()).billing).toMatchObject({ legalName: "Bangsar Spine Sdn Bhd", sstEnabled: true, sstRate: 8, invoicePrefix: "BSX", effectivePrefix: "BSX" });
    expect((await put({ invoicePrefix: "TOO-LONG-PREFIX" })).status).toBe(422);
    expect((await put({ sstRate: 101 })).status).toBe(422);
    expect((await put({ unknownField: 1 })).status).toBe(422);
    const cleared = await (await put({ legalName: "" })).json();
    expect(cleared.billing.legalName).toBeNull();

    asRole("DOCTOR");
    expect((await get()).status).toBe(403);
    asRole(null);
    expect((await get()).status).toBe(404);
  });
});
