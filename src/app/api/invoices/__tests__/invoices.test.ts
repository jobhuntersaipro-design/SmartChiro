import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

const PREFIX = `test-invoices-${Date.now()}`;
let branchId: string, patientId: string, userId: string;
const ids: Record<string, string> = {};

const as = (role: "OWNER" | "ADMIN" | "DOCTOR" | null) => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: userId } as never);
  vi.mocked(getUserBranchRole).mockResolvedValue(role as never);
};
const list = async (query: string) => {
  const { GET } = await import("../route");
  return GET(new Request(`http://x/api/invoices?branchId=${branchId}&${query}`));
};
const patch = async (id: string, status: string) => {
  const { PATCH } = await import("../[invoiceId]/route");
  return PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ status }) }), {
    params: Promise.resolve({ invoiceId: id }),
  });
};

describe("invoices API", () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `${PREFIX}@t.com`, name: "U" } });
    userId = u.id;
    const b = await prisma.branch.create({ data: { name: `${PREFIX} B` } });
    branchId = b.id;
    const p = await prisma.patient.create({ data: { firstName: "Siti", lastName: PREFIX, branchId, doctorId: userId } });
    patientId = p.id;
    const make = (key: string, status: "DRAFT" | "SENT" | "PAID", dueDays: number | null, amount: number) =>
      prisma.invoice
        .create({
          data: {
            invoiceNumber: `${PREFIX}-${key}`,
            amount,
            status,
            dueDate: dueDays === null ? null : new Date(Date.now() + dueDays * 86400000),
            paidAt: status === "PAID" ? new Date() : null,
            amountPaid: status === "PAID" ? amount : 0,
            lineItems: [{ description: "Adjustment", quantity: 1, unitPrice: amount, total: amount }],
            patientId,
            branchId,
            // "Paid this month" counts payments received, so a paid invoice carries its payment.
            ...(status === "PAID"
              ? { payments: { create: { amount, method: "CASH", receivedAt: new Date(), receiptNumber: `${PREFIX}-R-${key}`, branchId } } }
              : {}),
          },
        })
        .then((inv) => (ids[key] = inv.id));
    await Promise.all([make("draft", "DRAFT", 14, 100), make("sent", "SENT", 14, 150), make("late", "SENT", -3, 200), make("paid", "PAID", null, 80)]);
  });

  beforeEach(() => vi.clearAllMocks());

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { branchId } });
    await prisma.patient.deleteMany({ where: { id: patientId } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("lists a branch's invoices for OWNER/ADMIN with summary figures; overdue is derived", async () => {
    as("ADMIN");
    const res = await list("status=all");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(4);
    const byNumber = Object.fromEntries(data.invoices.map((i: { invoiceNumber: string; status: string }) => [i.invoiceNumber, i.status]));
    expect(byNumber[`${PREFIX}-late`]).toBe("OVERDUE");
    expect(byNumber[`${PREFIX}-sent`]).toBe("SENT");
    expect(data.summary).toMatchObject({ outstanding: 350, overdue: 200, overdueCount: 1, paidThisMonth: 80, draftCount: 1 });

    const overdue = await (await list("status=OVERDUE")).json();
    expect(overdue.invoices.map((i: { invoiceNumber: string }) => i.invoiceNumber)).toEqual([`${PREFIX}-late`]);
    const search = await (await list(`search=${PREFIX}-paid`)).json();
    expect(search.total).toBe(1);
  });

  it("narrows list and summary to one patient with ?patientId=", async () => {
    const other = await prisma.patient.create({ data: { firstName: "Other", lastName: PREFIX, branchId, doctorId: userId } });
    const inv = await prisma.invoice.create({
      data: {
        invoiceNumber: `${PREFIX}-other`,
        amount: 500,
        status: "SENT",
        lineItems: [{ description: "Package", quantity: 1, unitPrice: 500, total: 500 }],
        patientId: other.id,
        branchId,
      },
    });
    try {
      as("OWNER");
      const data = await (await list(`status=all&patientId=${other.id}`)).json();
      expect(data.invoices.map((i: { id: string }) => i.id)).toEqual([inv.id]);
      expect(data.summary).toMatchObject({ outstanding: 500, overdue: 0, paidThisMonth: 0, draftCount: 0 });
      const mine = await (await list(`status=all&patientId=${patientId}`)).json();
      expect(mine.total).toBe(4);
      expect(mine.summary.outstanding).toBe(350);
    } finally {
      await prisma.invoice.delete({ where: { id: inv.id } });
      await prisma.patient.delete({ where: { id: other.id } });
    }
  });

  it("keeps billing away from doctors and outsiders", async () => {
    as("DOCTOR");
    expect((await list("")).status).toBe(403);
    as(null);
    expect((await list("")).status).toBe(404);
    expect((await patch(ids.draft, "SENT")).status).toBe(404);
  });

  it("moves draft → sent → paid (stamping paidAt), and treats paid as final", async () => {
    as("OWNER");
    expect((await patch(ids.draft, "SENT")).status).toBe(200);
    const paid = await patch(ids.draft, "PAID");
    expect(paid.status).toBe(200);
    expect((await paid.json()).invoice.paidAt).not.toBeNull();
    const again = await patch(ids.draft, "CANCELLED");
    expect(again.status).toBe(422);
    expect((await patch(ids.late, "BOGUS")).status).toBe(422);
  });

  it("renders a receipt PDF for a paid invoice", async () => {
    as("OWNER");
    const { GET } = await import("../[invoiceId]/pdf/route");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ invoiceId: ids.paid }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("receipt-");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
