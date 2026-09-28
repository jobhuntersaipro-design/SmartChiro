import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createInvoice, recordPayment } from "@/lib/invoices";
import type { MyInvoisClient } from "@/lib/myinvois/client";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
vi.mock("@/lib/myinvois/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/myinvois/client")>();
  return { ...actual, getMyInvoisClient: vi.fn(() => null) };
});
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { getMyInvoisClient } from "@/lib/myinvois/client";

const STAMP = Date.now().toString(36).toUpperCase();
const PREFIX = `test-einv-${STAMP}`;
const INV_PREFIX = `E${STAMP.slice(-7)}`;
let branchId: string, userId: string, localId: string, foreignId: string, noIdId: string;

type Role = "OWNER" | "ADMIN" | "DOCTOR" | "FRONT_DESK" | null;
const as = (role: Role) => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: userId } as never);
  vi.mocked(getUserBranchRole).mockResolvedValue(role as never);
};
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const post = (body?: unknown) => new Request("http://x", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

async function route() {
  return import("../route");
}
async function getState(invoiceId: string) {
  const res = await (await route()).GET(new Request("http://x"), params({ invoiceId }));
  return { status: res.status, body: await res.json() };
}
async function submit(invoiceId: string, body?: unknown) {
  const res = await (await route()).POST(post(body), params({ invoiceId }));
  return { status: res.status, body: await res.json() };
}
async function documentJson(invoiceId: string, query = "") {
  const { GET } = await import("../document.json/route");
  return GET(new Request(`http://x/api/invoices/${invoiceId}/einvoice/document.json${query}`), params({ invoiceId }));
}
async function cancel(submissionId: string, reason: string) {
  const { POST } = await import("@/app/api/einvoice/submissions/[submissionId]/cancel/route");
  const res = await POST(post({ reason }), params({ submissionId }));
  return { status: res.status, body: await res.json() };
}
async function consolidated(method: "GET" | "POST", month: string, extra = "") {
  const mod = await import("@/app/api/branches/[branchId]/einvoice/consolidated/route");
  const req = new Request(`http://x/api/branches/${branchId}/einvoice/consolidated?month=${month}${extra}`, { method });
  return method === "GET" ? mod.GET(req, params({ branchId })) : mod.POST(req, params({ branchId }));
}

async function newInvoice(patientId: string, unitPrice: number, opts: { issuedAt?: Date; status?: "DRAFT" | "SENT" } = {}) {
  return prisma.$transaction((tx) =>
    createInvoice(tx, {
      branchId,
      patientId,
      lines: [{ description: "Chiropractic adjustment", quantity: 1, unitPrice }],
      status: opts.status ?? "SENT",
      issuedAt: opts.issuedAt,
    }),
  );
}

/** A scripted stand-in for LHDN: accepts everything, then reports `next` status on poll. */
function fakeClient(opts: { reject?: boolean; pollStatus?: "Valid" | "Invalid" | "Submitted" } = {}) {
  let n = 0;
  const client = {
    submitDocuments: vi.fn(async (docs: { format: string; codeNumber: string; document: string; documentHash: string }[]) => {
      return opts.reject
        ? {
            submissionUid: `SUB${++n}`,
            acceptedDocuments: [],
            rejectedDocuments: docs.map((d) => ({ invoiceCodeNumber: d.codeNumber, error: { errorCode: "CF321", error: "Invalid TIN" } })),
          }
        : {
            submissionUid: `SUB${++n}`,
            acceptedDocuments: docs.map((d, i) => ({ uuid: `UUID-${d.codeNumber}-${i}`, invoiceCodeNumber: d.codeNumber })),
            rejectedDocuments: [],
          };
    }),
    getSubmission: vi.fn(async (uid: string): Promise<unknown> => ({ submissionUid: uid })),
    getDocumentDetails: vi.fn(async (uuid: string) => ({
      uuid,
      submissionUid: "SUB",
      internalId: "",
      status: opts.pollStatus ?? "Valid",
      longId: "LONG-" + uuid,
      validationResults: { status: "Invalid", validationSteps: [{ name: "Step03-Taxpayer Validator", status: "Invalid", error: { errorCode: "DS302", error: "Buyer TIN not found" } }] },
    })),
    cancelDocument: vi.fn(async (uuid: string) => ({ uuid, status: "Cancelled" })),
  };
  // Poll returns the status for whatever UUIDs were accepted.
  client.getSubmission.mockImplementation(async (uid: string) => {
    const accepted = (await Promise.all(client.submitDocuments.mock.results.map((r) => r.value))).flatMap(
      (v: { submissionUid: string; acceptedDocuments: { uuid: string; invoiceCodeNumber: string }[] }) =>
        v.submissionUid === uid ? v.acceptedDocuments : [],
    );
    return {
      submissionUid: uid,
      documentCount: accepted.length,
      dateTimeReceived: new Date().toISOString(),
      overallStatus: opts.pollStatus === "Invalid" ? "invalid" : "valid",
      documentSummary: accepted.map((d) => ({
        uuid: d.uuid,
        submissionUid: uid,
        internalId: d.invoiceCodeNumber,
        status: opts.pollStatus ?? "Valid",
        longId: opts.pollStatus === "Invalid" ? null : `LONG-${d.uuid}`,
        dateTimeValidated: new Date().toISOString(),
      })),
    } as never;
  });
  vi.mocked(getMyInvoisClient).mockReturnValue(client as unknown as MyInvoisClient);
  return client;
}

describe("LHDN MyInvois e-invoice routes", () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `${PREFIX}@t.com`, name: "Owner" } });
    userId = u.id;
    const b = await prisma.branch.create({
      data: {
        name: `${PREFIX} Branch`,
        invoicePrefix: INV_PREFIX,
        sstEnabled: true,
        sstRate: 6,
        legalName: "Test Chiro Sdn Bhd",
        ssmRegNo: "202401000001",
        tin: "C1234567890",
        sstRegNo: "W10-1234-56789012",
        msicCode: "86909",
        businessActivity: "Other human health services n.e.c.",
        einvoiceEnabled: true,
        address: "Lot 1, Menara Test",
        city: "Kuala Lumpur",
        state: "Wilayah Persekutuan Kuala Lumpur",
        zip: "50088",
        phone: "03-2141 0000",
        email: "clinic@test.my",
      },
    });
    branchId = b.id;
    const base = { branchId, doctorId: userId, city: "Petaling Jaya", state: "Selangor", postcode: "47400", addressLine1: "8, Jalan SS21/1" };
    localId = (
      await prisma.patient.create({
        data: { ...base, firstName: "Siti", lastName: `${PREFIX}-my`, icNumber: `880412-14-${String(Date.now()).slice(-4)}`, phone: "012-345 6789" },
      })
    ).id;
    foreignId = (
      await prisma.patient.create({
        data: { ...base, firstName: "John", lastName: `${PREFIX}-sg`, nationality: "SG", passportNumber: "E1234567K", phone: "+65 9123 4567" },
      })
    ).id;
    noIdId = (await prisma.patient.create({ data: { ...base, firstName: "Walk", lastName: `${PREFIX}-in`, phone: null } })).id;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMyInvoisClient).mockReturnValue(null);
  });

  afterAll(async () => {
    await prisma.invoice.updateMany({ where: { branchId }, data: { consolidatedIntoId: null } });
    await prisma.eInvoiceSubmission.deleteMany({ where: { branchId } });
    await prisma.invoice.deleteMany({ where: { branchId } });
    await prisma.patient.deleteMany({ where: { branchId } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("GET shows status + pre-submission check; RBAC: doctors read, strangers 404, POST needs OWNER/ADMIN", async () => {
    const inv = await newInvoice(localId, 120);
    as("DOCTOR");
    const read = await getState(inv.id);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ einvoiceStatus: "NOT_SUBMITTED", canManage: false, configured: false, validation: { ok: true } });
    expect((await submit(inv.id)).status).toBe(403);
    as("FRONT_DESK");
    expect((await submit(inv.id)).status).toBe(403);
    as(null);
    expect((await getState(inv.id)).status).toBe(404);
    expect((await submit(inv.id)).status).toBe(404);
  });

  it("without credentials: submit says not configured, but the JSON download works", async () => {
    const inv = await newInvoice(foreignId, 100);
    as("OWNER");
    const res = await submit(inv.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("myinvois_not_configured");

    const dl = await documentJson(inv.id);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("Content-Disposition")).toContain(`einvoice-${inv.invoiceNumber}.json`);
    const doc = JSON.parse(await dl.text());
    const body = doc.Invoice[0];
    expect(body.ID[0]._).toBe(inv.invoiceNumber);
    expect(body.InvoiceTypeCode[0]).toEqual({ _: "01", listVersionID: "1.0" });
    expect(body.AccountingCustomerParty[0].Party[0].PartyIdentification[0].ID[0]._).toBe("EI00000000020");
    expect(body.TaxTotal[0].TaxAmount[0]._).toBe(6);
    expect(body.LegalMonetaryTotal[0].PayableAmount[0]._).toBe(106);
  });

  it("validation errors block the JSON and the submission with field-level messages", async () => {
    const inv = await newInvoice(noIdId, 80);
    as("ADMIN");
    const dl = await documentJson(inv.id);
    expect(dl.status).toBe(422);
    const err = await dl.json();
    expect(err.errors.map((e: { field: string }) => e.field).sort()).toEqual(["patient.id", "patient.phone"]);
    fakeClient();
    const res = await submit(inv.id);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation_failed");
    const draft = await newInvoice(localId, 50, { status: "DRAFT" });
    expect((await getState(draft.id)).body.validation.errors.map((e: { field: string }) => e.field)).toContain("invoice.status");
  });

  it("submit → SUBMITTED, poll → VALID with validation link; resubmit refused; cancel within 72h", async () => {
    const inv = await newInvoice(localId, 150);
    const client = fakeClient();
    as("OWNER");
    const res = await submit(inv.id);
    expect(res.status).toBe(201);
    expect(res.body.submission).toMatchObject({ status: "SUBMITTED", kind: "INVOICE", codeNumber: inv.invoiceNumber, documentVersion: "1.0" });
    const sent = client.submitDocuments.mock.calls[0][0][0];
    expect(sent.format).toBe("JSON");
    expect(Buffer.from(sent.document, "base64").toString("utf8")).toContain(inv.invoiceNumber);
    expect(sent.documentHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await prisma.invoice.findUnique({ where: { id: inv.id } }))!.einvoiceStatus).toBe("SUBMITTED");

    const state = await getState(inv.id);
    expect(state.body.einvoiceStatus).toBe("VALID");
    expect(state.body.current.validationUrl).toBe(`https://preprod.myinvois.hasil.gov.my/${state.body.current.uuid}/share/LONG-${state.body.current.uuid}`);
    expect(state.body.current.cancellableUntil).toBeTruthy();

    const again = await submit(inv.id);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("already_submitted");

    const pdf = await (await import("../../pdf/route")).GET(new Request("http://x"), params({ invoiceId: inv.id }));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");

    as("DOCTOR");
    expect((await cancel(state.body.current.id, "Wrong buyer details")).status).toBe(403);
    as("OWNER");
    const cancelled = await cancel(state.body.current.id, "Wrong buyer details");
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.submission.status).toBe("CANCELLED");
    expect(client.cancelDocument).toHaveBeenCalledWith(state.body.current.uuid, "Wrong buyer details");
    expect((await prisma.invoice.findUnique({ where: { id: inv.id } }))!.einvoiceStatus).toBe("CANCELLED");
  });

  it("refuses cancellation after the 72-hour window", async () => {
    const inv = await newInvoice(localId, 90);
    fakeClient();
    as("OWNER");
    await submit(inv.id);
    await getState(inv.id);
    const row = await prisma.eInvoiceSubmission.findFirst({ where: { invoiceId: inv.id } });
    await prisma.eInvoiceSubmission.update({ where: { id: row!.id }, data: { validatedAt: new Date(Date.now() - 73 * 3600_000) } });
    const res = await cancel(row!.id, "Too late");
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("cancel_window_passed");
  });

  it("LHDN rejection → INVALID with its errors, and the invoice can be resubmitted", async () => {
    const inv = await newInvoice(localId, 60);
    fakeClient({ reject: true });
    as("ADMIN");
    const res = await submit(inv.id);
    expect(res.status).toBe(201);
    expect(res.body.submission).toMatchObject({ status: "INVALID", errors: [{ code: "CF321", message: "Invalid TIN" }] });
    expect((await prisma.invoice.findUnique({ where: { id: inv.id } }))!.einvoiceStatus).toBe("INVALID");
    fakeClient();
    expect((await submit(inv.id)).status).toBe(201);
  });

  it("async validation failure is stored with LHDN's step errors", async () => {
    const inv = await newInvoice(localId, 70);
    fakeClient({ pollStatus: "Invalid" });
    as("OWNER");
    await submit(inv.id);
    const state = await getState(inv.id);
    expect(state.body.einvoiceStatus).toBe("INVALID");
    expect(state.body.current.errors[0]).toMatchObject({ code: "DS302", message: "Buyer TIN not found" });
  });

  it("refund note references the validated e-invoice", async () => {
    const inv = await newInvoice(foreignId, 200);
    await prisma.$transaction((tx) => recordPayment(tx, { invoiceId: inv.id, amount: 212, method: "CASH" }));
    const refund = await prisma.$transaction((tx) => recordPayment(tx, { invoiceId: inv.id, amount: -53, method: "CASH", refundReason: "Session not used" }));
    as("OWNER");
    expect((await documentJson(inv.id, `?paymentId=${refund.payment.id}`)).status).toBe(422);
    const client = fakeClient();
    await submit(inv.id);
    const state = await getState(inv.id);
    expect(state.body.einvoiceStatus).toBe("VALID");
    const dl = await documentJson(inv.id, `?paymentId=${refund.payment.id}`);
    expect(dl.status).toBe(200);
    const note = JSON.parse(await dl.text()).Invoice[0];
    expect(note.InvoiceTypeCode[0]._).toBe("04");
    expect(note.BillingReference[0].InvoiceDocumentReference[0].UUID[0]._).toBe(state.body.current.uuid);
    expect(note.LegalMonetaryTotal[0].PayableAmount[0]._).toBe(53);
    const res = await submit(inv.id, { paymentId: refund.payment.id });
    expect(res.status).toBe(201);
    expect(res.body.submission).toMatchObject({ kind: "REFUND_NOTE", codeNumber: refund.payment.receiptNumber });
    expect(client.submitDocuments).toHaveBeenCalledTimes(2);
  });

  describe("monthly consolidated e-invoice", () => {
    const MONTH = "2026-08";
    const inAugust = new Date("2026-08-15T04:00:00Z");
    let individualId: string, pooledIds: string[], bigId: string;

    beforeAll(async () => {
      const individual = await newInvoice(localId, 100, { issuedAt: inAugust });
      individualId = individual.id;
      pooledIds = [(await newInvoice(noIdId, 80, { issuedAt: inAugust })).id, (await newInvoice(foreignId, 100, { issuedAt: inAugust })).id];
      bigId = (await newInvoice(localId, 12_000, { issuedAt: inAugust })).id;
      await newInvoice(localId, 40, { issuedAt: inAugust, status: "DRAFT" });
    });

    it("excludes individually submitted invoices, drafts and sales over RM10,000", async () => {
      const client = fakeClient();
      as("OWNER");
      expect((await submit(individualId)).status).toBe(201);
      await getState(individualId);
      expect(client.submitDocuments).toHaveBeenCalledTimes(1);

      const res = await consolidated("GET", MONTH);
      expect(res.status).toBe(200);
      const preview = await res.json();
      expect(preview.included.map((i: { id: string }) => i.id).sort()).toEqual([...pooledIds].sort());
      expect(preview.excluded).toEqual([expect.objectContaining({ id: bigId, reason: "over_limit" })]);
      expect(preview.totals).toMatchObject({ subtotal: 180, taxAmount: 10.8, total: 190.8, documents: 1 }) // no IC or nationality → treated as non-Malaysian (SST);
      expect(preview.monthEnded).toBe(true);
    });

    it("downloads the consolidated JSON without credentials", async () => {
      as("ADMIN");
      const res = await consolidated("GET", MONTH, "&format=json");
      expect(res.status).toBe(200);
      const doc = JSON.parse(await res.text()).Invoice[0];
      expect(doc.AccountingCustomerParty[0].Party[0].PartyIdentification[0].ID[0]._).toBe("EI00000000010");
      expect(doc.InvoicePeriod[0]).toMatchObject({ StartDate: [{ _: "2026-08-01" }], EndDate: [{ _: "2026-08-31" }] });
      expect(doc.InvoiceLine.every((l: { Item: { CommodityClassification: { ItemClassificationCode: { _: string }[] }[] }[] }) => l.Item[0].CommodityClassification[0].ItemClassificationCode[0]._ === "004")).toBe(true);
      as("DOCTOR");
      expect((await consolidated("GET", MONTH)).status).toBe(403);
    });

    it("submits, links the invoices, and doesn't include them again", async () => {
      as("OWNER");
      expect((await consolidated("POST", MONTH)).status).toBe(409); // not configured
      fakeClient();
      const res = await consolidated("POST", MONTH);
      expect(res.status).toBe(201);
      const { submissions } = await res.json();
      expect(submissions).toHaveLength(1);
      expect(submissions[0]).toMatchObject({ kind: "CONSOLIDATED", status: "SUBMITTED" });
      expect(submissions[0].codeNumber).toMatch(new RegExp(`^CONS-${INV_PREFIX}-202608-01$`));
      const linked = await prisma.invoice.findMany({ where: { id: { in: pooledIds } } });
      expect(linked.every((i) => i.consolidatedIntoId === submissions[0].id && i.einvoiceStatus === "SUBMITTED")).toBe(true);

      const after = await (await consolidated("GET", MONTH)).json();
      expect(after.included).toEqual([]);
      expect(after.submissions[0].status).toBe("VALID");
      const pooled = await getState(pooledIds[0]);
      expect(pooled.body.consolidatedInto.status).toBe("VALID");
      expect((await submit(pooledIds[0])).body.error).toBe("already_consolidated");
    });

    it("refuses a month that hasn't ended", async () => {
      fakeClient();
      as("OWNER");
      const res = await consolidated("POST", "2999-01");
      expect(res.status).toBe(422);
      expect((await res.json()).error).toBe("month_not_ended");
    });
  });
});
