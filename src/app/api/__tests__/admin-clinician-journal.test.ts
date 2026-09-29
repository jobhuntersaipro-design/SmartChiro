import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { clinicDateKey, clinicInstant } from "@/lib/clinic-time";
import { countClinicians } from "@/lib/stats-scope";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

import { GET as listDoctors } from "../doctors/route";
import { PATCH as patchInvoice } from "../invoices/[invoiceId]/route";
import { GET as journalCsv } from "../exports/journal.csv/route";

const PREFIX = `test-adm-jrnl-${Date.now()}`;
const as = (userId: string) => mockAuth.mockResolvedValue({ user: { id: userId } });
const patch = (invoiceId: string, body: unknown) =>
  patchInvoice(
    new Request(`http://x/api/invoices/${invoiceId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ invoiceId }) },
  );
const journalRows = async (query: string) =>
  (await (await journalCsv(new Request(`http://x/api/exports/journal.csv?${query}`))).text())
    .trimEnd()
    .split("\r\n")
    .slice(1)
    .map((r) => r.split(","));

let ownerId: string, treatingAdminId: string, officeAdminId: string, doctorId: string;
let branchId: string, patientId: string;

describe("owner decisions 2026-09-29", () => {
  beforeAll(async () => {
    const users = await Promise.all(
      ["owner", "treating-admin", "office-admin", "doctor"].map((n) =>
        prisma.user.create({ data: { email: `${PREFIX}-${n}@t.test`, name: `${n} ${PREFIX}` } }),
      ),
    );
    [ownerId, treatingAdminId, officeAdminId, doctorId] = users.map((u) => u.id);
    branchId = (await prisma.branch.create({ data: { name: `${PREFIX} branch` } })).id;
    await prisma.branchMember.createMany({
      data: [
        { userId: ownerId, branchId, role: "OWNER" },
        { userId: treatingAdminId, branchId, role: "ADMIN" },
        { userId: officeAdminId, branchId, role: "ADMIN" },
        { userId: doctorId, branchId, role: "DOCTOR" },
      ],
    });
    await prisma.doctorProfile.create({ data: { userId: treatingAdminId, licenseNumber: "DC-1" } });
    patientId = (await prisma.patient.create({ data: { firstName: "Siti", lastName: PREFIX, branchId, doctorId } })).id;
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { branchId } });
    await prisma.patient.deleteMany({ where: { branchId } });
    await prisma.branchMember.deleteMany({ where: { branchId } });
    await prisma.branch.delete({ where: { id: branchId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  });

  describe("an ADMIN with a doctor profile is a clinician", () => {
    it("is listed by /api/doctors?clinical=1; an office admin is not", async () => {
      as(ownerId);
      const res = await listDoctors(new NextRequest(`http://x/api/doctors?clinical=1&branchId=${branchId}`));
      const ids = (await res.json()).doctors.map((d: { id: string }) => d.id);
      expect(ids).toEqual(expect.arrayContaining([ownerId, doctorId, treatingAdminId]));
      expect(ids).not.toContain(officeAdminId);
    });

    it("counts toward the clinician total until the profile is deactivated", async () => {
      expect(await countClinicians([branchId])).toBe(3);
      await prisma.doctorProfile.update({ where: { userId: treatingAdminId }, data: { isActive: false } });
      expect(await countClinicians([branchId])).toBe(2);
      await prisma.doctorProfile.update({ where: { userId: treatingAdminId }, data: { isActive: true } });
    });
  });

  describe("cancelling an exported invoice", () => {
    const issuedAt = clinicInstant(2026, 8, 10, 10);
    const invoice = (status: "SENT" | "DRAFT") =>
      prisma.invoice.create({
        data: {
          invoiceNumber: `${PREFIX}-${status}`,
          branchId,
          patientId,
          status,
          amount: 106,
          subtotal: 100,
          taxAmount: 6,
          taxLabel: "SST 6%",
          issuedAt,
          lineItems: [{ description: "Adjustment", quantity: 1, unitPrice: 100, total: 100, taxable: true }],
        },
      });

    it("keeps the sale in the issue month and reverses it in the month it was cancelled", async () => {
      const sent = await invoice("SENT");
      as(ownerId);
      expect((await patch(sent.id, { status: "CANCELLED" })).status).toBe(200);
      const cancelledAt = (await prisma.invoice.findUniqueOrThrow({ where: { id: sent.id } })).cancelledAt;
      expect(cancelledAt).toBeInstanceOf(Date);

      const august = (await journalRows(`branchId=${branchId}&from=2026-08-01&to=2026-08-31`)).filter((r) => r[4] === sent.invoiceNumber);
      expect(august.map((r) => [r[1], r[2], r[3]])).toEqual([["1200", "106.00", "0.00"], ["4000", "0.00", "100.00"], ["2200", "0.00", "6.00"]]);

      const day = clinicDateKey(cancelledAt!);
      const reversal = (await journalRows(`branchId=${branchId}&from=${day}&to=${day}`)).filter((r) => r[4] === sent.invoiceNumber);
      expect(reversal.map((r) => [r[1], r[2], r[3]])).toEqual([["4000", "100.00", "0.00"], ["2200", "6.00", "0.00"], ["1200", "0.00", "106.00"]]);
    });

    it("records no cancellation date for a draft, which never reached the books", async () => {
      const draft = await invoice("DRAFT");
      as(ownerId);
      expect((await patch(draft.id, { status: "CANCELLED" })).status).toBe(200);
      const row = await prisma.invoice.findUniqueOrThrow({ where: { id: draft.id } });
      expect(row.status).toBe("CANCELLED");
      expect(row.cancelledAt).toBeNull();
      const august = await journalRows(`branchId=${branchId}&from=2026-08-01&to=2026-08-31`);
      expect(august.some((r) => r[4] === draft.invoiceNumber)).toBe(false);
    });
  });
});
