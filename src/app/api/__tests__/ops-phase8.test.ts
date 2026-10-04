import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { clinicDateKey, clinicInstant } from "@/lib/clinic-time";
import { addDaysToKey } from "@/lib/reports/range";
import { expiryInstant } from "@/lib/certificates";
import { sweepCertificateAlerts, type CertificateAlertEmail } from "@/lib/certificate-alerts";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

import { GET as certificates } from "../dashboard/certificates/route";
import { PUT as putDoctor } from "../doctors/[userId]/route";
import { GET as listRules, POST as createRule } from "../branches/[branchId]/commission-rules/route";
import { PATCH as patchRule, DELETE as deleteRule } from "../branches/[branchId]/commission-rules/[ruleId]/route";
import { GET as commissions } from "../reports/commissions/route";
import { GET as invoicesCsv } from "../exports/invoices.csv/route";
import { GET as paymentsCsv } from "../exports/payments.csv/route";
import { GET as xeroCsv } from "../exports/xero-invoices.csv/route";
import { GET as journalCsv } from "../exports/journal.csv/route";
import { PUT as putBilling } from "../branches/[branchId]/billing/route";
import { NextRequest } from "next/server";

const PREFIX = `test-ops8-${Date.now()}`;
const AUGUST = "from=2026-08-01&to=2026-08-31";
const aug = (day: number, hour = 10) => clinicInstant(2026, 8, day, hour);
const today = clinicDateKey();
const inDays = (n: number) => expiryInstant(addDaysToKey(today, n));

let ownerId: string, adminId: string, doctorId: string, deskId: string, outsiderId: string, doctor2Id: string;
let branchA: string, foreign: string;
let seq = 0;
const uid = () => `${PREFIX}-${++seq}`;

const as = (userId: string | null) => mockAuth.mockResolvedValue(userId ? { user: { id: userId } } : null);
const get = (url: string) => new Request(`http://x${url}`);
const json = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://x${url}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const branchCtx = (branchId: string) => ({ params: Promise.resolve({ branchId }) });
const ruleCtx = (branchId: string, ruleId: string) => ({ params: Promise.resolve({ branchId, ruleId }) });

describe("Phase 8.1–8.3 ops", () => {
  beforeAll(async () => {
    const names = ["owner", "admin", "doctor", "desk", "outsider", "doctor2"];
    const users = await Promise.all(
      names.map((n) => prisma.user.create({ data: { email: `${PREFIX}-${n}@t.test`, name: `${n} ${PREFIX}` } })),
    );
    [ownerId, adminId, doctorId, deskId, outsiderId, doctor2Id] = users.map((u) => u.id);
    const [a, f] = await Promise.all(["A", "F"].map((n) => prisma.branch.create({ data: { name: `${PREFIX} ${n}` } })));
    [branchA, foreign] = [a.id, f.id];
    await prisma.branchMember.createMany({
      data: [
        { userId: ownerId, branchId: branchA, role: "OWNER" },
        { userId: adminId, branchId: branchA, role: "ADMIN" },
        { userId: doctorId, branchId: branchA, role: "DOCTOR" },
        { userId: deskId, branchId: branchA, role: "FRONT_DESK" },
        { userId: outsiderId, branchId: foreign, role: "OWNER" },
        { userId: doctor2Id, branchId: foreign, role: "DOCTOR" },
      ],
    });
    await prisma.doctorProfile.createMany({
      data: [
        { userId: doctorId, apcNumber: "APC-1", apcExpiresAt: inDays(20) },
        { userId: ownerId, apcNumber: "APC-O", apcExpiresAt: inDays(200) },
        { userId: doctor2Id, apcNumber: "APC-2", apcExpiresAt: inDays(5) },
      ],
    });

    // August money at branch A.
    const patient = await prisma.patient.create({ data: { firstName: "Siti", lastName: PREFIX, branchId: branchA, doctorId, email: `${PREFIX}-p@t.test` } });
    const appt = await prisma.appointment.create({
      data: { branchId: branchA, patientId: patient.id, doctorId, dateTime: aug(3), status: "COMPLETED", treatmentType: "ADJUSTMENT" },
    });
    await prisma.visit.create({ data: { patientId: patient.id, doctorId, visitDate: aug(5) } });
    const invoice = (data: { amount: number; issuedAt: Date; appointmentId?: string; taxAmount?: number; status?: "SENT" | "PAID" | "DRAFT" | "CANCELLED" }) =>
      prisma.invoice.create({
        data: {
          invoiceNumber: uid(),
          branchId: branchA,
          patientId: patient.id,
          status: data.status ?? "PAID",
          amount: data.amount,
          taxAmount: data.taxAmount ?? null,
          taxLabel: data.taxAmount ? "SST 6%" : null,
          amountPaid: data.amount,
          issuedAt: data.issuedAt,
          appointmentId: data.appointmentId,
          lineItems: [{ description: "Treatment", quantity: 1, unitPrice: data.amount - (data.taxAmount ?? 0), total: data.amount - (data.taxAmount ?? 0), taxable: true }],
        },
      });
    const pay = (invoiceId: string, amount: number, receivedAt: Date, method: "CASH" | "FPX" | "CARD" = "CASH") =>
      prisma.payment.create({ data: { invoiceId, branchId: branchA, amount, receivedAt, method, receiptNumber: uid() } });

    const apptInvoice = await invoice({ amount: 150, issuedAt: aug(3), appointmentId: appt.id });
    await pay(apptInvoice.id, 150, aug(3));
    await pay(apptInvoice.id, -20, aug(6), "CARD");
    const pkgInvoice = await invoice({ amount: 636, taxAmount: 36, issuedAt: aug(10) });
    await prisma.patientPackage.create({
      data: { patientId: patient.id, branchId: branchA, name: "12 Adjustments", sessionsTotal: 12, price: 636, soldById: deskId, invoiceId: pkgInvoice.id },
    });
    await pay(pkgInvoice.id, 636, aug(10), "FPX");
    const manual = await invoice({ amount: 80, issuedAt: aug(12) });
    await pay(manual.id, 80, aug(12));
    await invoice({ amount: 999, issuedAt: aug(13), status: "DRAFT" });
  });

  afterAll(async () => {
    const branches = { in: [branchA, foreign] };
    await prisma.patientPackage.deleteMany({ where: { branchId: branches } });
    await prisma.payment.deleteMany({ where: { branchId: branches } });
    await prisma.invoice.deleteMany({ where: { branchId: branches } });
    await prisma.visit.deleteMany({ where: { patient: { branchId: branches } } });
    await prisma.appointment.deleteMany({ where: { branchId: branches } });
    await prisma.patient.deleteMany({ where: { branchId: branches } });
    await prisma.commissionRule.deleteMany({ where: { branchId: branches } });
    await prisma.branchMember.deleteMany({ where: { branchId: branches } });
    await prisma.branch.deleteMany({ where: { id: branches } });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  });

  // ─── 8.1 ───

  describe("GET /api/dashboard/certificates", () => {
    it("lists clinicians in scope expiring within 60 days", async () => {
      as(ownerId);
      const res = await certificates(get(`/api/dashboard/certificates?branchId=${branchA}`));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.certificates).toHaveLength(1);
      expect(body.certificates[0]).toMatchObject({ userId: doctorId, apcNumber: "APC-1", daysLeft: 20, stage: "d30" });
    });

    it("is for owners and admins of the branch only", async () => {
      as(adminId);
      expect((await certificates(get(`/api/dashboard/certificates?branchId=${branchA}`))).status).toBe(200);
      as(doctorId);
      expect((await certificates(get(`/api/dashboard/certificates?branchId=${branchA}`))).status).toBe(403);
      as(deskId);
      expect((await certificates(get(`/api/dashboard/certificates?branchId=${branchA}`))).status).toBe(403);
      as(outsiderId);
      expect((await certificates(get(`/api/dashboard/certificates?branchId=${branchA}`))).status).toBe(404);
      as(null);
      expect((await certificates(get(`/api/dashboard/certificates?branchId=${branchA}`))).status).toBe(401);
    });

    it("scopes 'all' to the caller's managed branches", async () => {
      as(outsiderId);
      const body = await (await certificates(get("/api/dashboard/certificates?branchId=all"))).json();
      expect(body.certificates.map((c: { userId: string }) => c.userId)).toEqual([doctor2Id]);
      expect(body.certificates[0].stage).toBe("d7");
    });
  });

  describe("certificate alert sweep", () => {
    const mine = (sent: CertificateAlertEmail[]) => sent.filter((e) => e.to.startsWith(PREFIX));

    it("emails branch owners once per threshold and re-arms when the expiry changes", async () => {
      const sent: CertificateAlertEmail[] = [];
      const sender = async (e: CertificateAlertEmail) => {
        sent.push(e);
        return true;
      };
      await sweepCertificateAlerts(new Date(), sender);
      expect(mine(sent).map((e) => e.to).sort()).toEqual([`${PREFIX}-outsider@t.test`, `${PREFIX}-owner@t.test`]);
      expect(mine(sent).find((e) => e.to.includes("-owner@"))?.subject).toContain("expires in 20 days");
      expect((await prisma.doctorProfile.findUnique({ where: { userId: doctorId } }))?.apcAlertStage).toBe(30);
      expect((await prisma.doctorProfile.findUnique({ where: { userId: doctor2Id } }))?.apcAlertStage).toBe(7);

      sent.length = 0;
      await sweepCertificateAlerts(new Date(), sender);
      expect(mine(sent)).toHaveLength(0);

      // Owner records a new expiry 3 days out: stage cleared, the 7-day alert goes out.
      as(ownerId);
      const res = await putDoctor(json(`/api/doctors/${doctorId}`, "PUT", { apcExpiresAt: addDaysToKey(today, 3) }), {
        params: Promise.resolve({ userId: doctorId }),
      });
      expect(res.status).toBe(200);
      expect((await res.json()).doctor.profile.apcExpiresOn).toBe(addDaysToKey(today, 3));
      expect((await prisma.doctorProfile.findUnique({ where: { userId: doctorId } }))?.apcAlertStage).toBeNull();
      await sweepCertificateAlerts(new Date(), sender);
      expect(mine(sent).map((e) => e.to)).toEqual([`${PREFIX}-owner@t.test`]);
      expect((await prisma.doctorProfile.findUnique({ where: { userId: doctorId } }))?.apcAlertStage).toBe(7);
    });

    it("keeps the stage when no email got through, so the next run retries", async () => {
      as(ownerId);
      await putDoctor(json(`/api/doctors/${doctorId}`, "PUT", { apcExpiresAt: addDaysToKey(today, 40) }), {
        params: Promise.resolve({ userId: doctorId }),
      });
      await sweepCertificateAlerts(new Date(), async () => false);
      expect((await prisma.doctorProfile.findUnique({ where: { userId: doctorId } }))?.apcAlertStage).toBeNull();
    });

    it("rejects a bad expiry and lets front desk edit nobody's certificate", async () => {
      as(ownerId);
      const bad = await putDoctor(json(`/api/doctors/${doctorId}`, "PUT", { apcExpiresAt: "31/12/2026" }), {
        params: Promise.resolve({ userId: doctorId }),
      });
      expect(bad.status).toBe(400);
      as(deskId);
      const desk = await putDoctor(json(`/api/doctors/${doctorId}`, "PUT", { apcNumber: "X" }), {
        params: Promise.resolve({ userId: doctorId }),
      });
      expect(desk.status).toBe(403);
    });
  });

  // ─── 8.2 ───

  describe("commission rules CRUD", () => {
    const url = () => `/api/branches/${branchA}/commission-rules`;

    it("owner / admin manage, others can't", async () => {
      as(ownerId);
      const created = await createRule(json(url(), "POST", { basis: "PERCENT_COLLECTED", rate: 10, effectiveFrom: "2026-01-01" }), branchCtx(branchA));
      expect(created.status).toBe(201);
      const rule = (await created.json()).rule;
      expect(rule).toMatchObject({ basis: "PERCENT_COLLECTED", rate: 10, effectiveFrom: "2026-01-01", doctorId: null, active: true });

      as(adminId);
      const list = await listRules(get(url()), branchCtx(branchA));
      expect(list.status).toBe(200);
      const body = await list.json();
      expect(body.rules.map((r: { id: string }) => r.id)).toContain(rule.id);
      expect(body.staff.map((s: { id: string }) => s.id)).toContain(doctorId);

      const patched = await patchRule(json(`${url()}/${rule.id}`, "PATCH", { rate: 12.5 }), ruleCtx(branchA, rule.id));
      expect(patched.status).toBe(200);
      expect((await patched.json()).rule.rate).toBe(12.5);

      as(doctorId);
      expect((await listRules(get(url()), branchCtx(branchA))).status).toBe(403);
      as(deskId);
      expect((await createRule(json(url(), "POST", { basis: "PERCENT_COLLECTED", rate: 5, effectiveFrom: "2026-01-01" }), branchCtx(branchA))).status).toBe(403);
      expect((await deleteRule(get(`${url()}/${rule.id}`), ruleCtx(branchA, rule.id))).status).toBe(403);
      as(outsiderId);
      expect((await listRules(get(url()), branchCtx(branchA))).status).toBe(404);
      expect((await patchRule(json(`${url()}/${rule.id}`, "PATCH", { rate: 1 }), ruleCtx(foreign, rule.id))).status).toBe(404);

      as(ownerId);
      expect((await deleteRule(get(`${url()}/${rule.id}`), ruleCtx(branchA, rule.id))).status).toBe(200);
      expect(await prisma.commissionRule.count({ where: { id: rule.id } })).toBe(0);
    });

    it("validates rules", async () => {
      as(ownerId);
      const post = (body: unknown) => createRule(json(url(), "POST", body), branchCtx(branchA));
      expect((await post({ basis: "PERCENT_COLLECTED", rate: 120, effectiveFrom: "2026-01-01" })).status).toBe(422);
      expect((await post({ basis: "FIXED_PER_VISIT", rate: 0, effectiveFrom: "2026-01-01" })).status).toBe(422);
      expect((await post({ basis: "PERCENT_PACKAGE_SALE", rate: 5, treatmentType: "ADJUSTMENT", effectiveFrom: "2026-01-01" })).status).toBe(422);
      expect((await post({ basis: "PERCENT_COLLECTED", rate: 5, doctorId: doctor2Id, effectiveFrom: "2026-01-01" })).status).toBe(422);
      expect((await post({ basis: "PERCENT_COLLECTED", rate: 5, effectiveFrom: "01/01/2026" })).status).toBe(422);
    });
  });

  describe("GET /api/reports/commissions", () => {
    it("uses revenue attribution and the most specific rule", async () => {
      as(ownerId);
      const post = (body: unknown) => createRule(json(`/api/branches/${branchA}/commission-rules`, "POST", body), branchCtx(branchA));
      await post({ basis: "PERCENT_COLLECTED", rate: 10, effectiveFrom: "2026-01-01" });
      await post({ basis: "PERCENT_PACKAGE_SALE", rate: 5, effectiveFrom: "2026-01-01" });

      const report = async () => {
        const res = await commissions(get(`/api/reports/commissions?branchId=${branchA}&${AUGUST}`));
        expect(res.status).toBe(200);
        return res.json();
      };
      let body = await report();
      const row = (id: string) => body.rows.find((r: { userId: string }) => r.userId === id);
      // Doctor: 150 − 20 refund on their appointment; manual invoice counts for nobody.
      expect(row(doctorId)).toMatchObject({ collected: 130, collectedCommission: 13, visits: 2, visitCommission: 0, total: 13 });
      // Package sale → the seller (front desk), net of the RM36 SST.
      expect(row(deskId)).toMatchObject({ packageSales: 600, packageCommission: 30, total: 30 });
      expect(body.totals.total).toBe(43);
      expect(body.ruleCount).toBe(2);

      // Doctor + treatment fixed rule beats the all-doctors %: RM 40 for the ADJUSTMENT visit only.
      await post({ basis: "FIXED_PER_VISIT", rate: 40, doctorId, treatmentType: "ADJUSTMENT", effectiveFrom: "2026-08-01" });
      body = await report();
      expect(row(doctorId)).toMatchObject({ collected: 130, collectedCommission: 0, visits: 2, visitCommission: 40, total: 40 });
    });

    it("is not for front desk or doctors", async () => {
      as(deskId);
      expect((await commissions(get(`/api/reports/commissions?branchId=${branchA}&${AUGUST}`))).status).toBe(403);
      as(doctorId);
      expect((await commissions(get(`/api/reports/commissions?branchId=${branchA}&${AUGUST}`))).status).toBe(403);
    });
  });

  // ─── 8.3 ───

  describe("GET /api/exports/*.csv", () => {
    const q = () => `?branchId=${branchA}&${AUGUST}`;
    const rows = (text: string) => text.replace(/^﻿/, "").trimEnd().split("\r\n");

    it("invoices and payments as attachments", async () => {
      as(ownerId);
      const inv = await invoicesCsv(get(`/api/exports/invoices.csv${q()}`));
      expect(inv.status).toBe(200);
      expect(inv.headers.get("content-type")).toContain("text/csv");
      expect(inv.headers.get("content-disposition")).toMatch(/^attachment; filename="smartchiro-invoices-.*-2026-08-01-to-2026-08-31\.csv"$/);
      const invRows = rows(await inv.text());
      expect(invRows[0]).toBe("Invoice no.,Issue date,Due date,Branch,Patient,Status,Currency,Subtotal,Tax,Tax type,Total,Paid,Balance");
      expect(invRows).toHaveLength(4); // draft excluded
      expect(invRows.find((r) => r.includes("636.00"))).toContain(",600.00,36.00,SST 6%,636.00,");

      as(adminId);
      const payRows = rows(await (await paymentsCsv(get(`/api/exports/payments.csv${q()}`))).text());
      expect(payRows).toHaveLength(5);
      expect(payRows.some((r) => r.includes(",Refund,Card,") && r.includes("-20.00"))).toBe(true);
    });

    it("Xero rows and a balanced journal with the branch's account codes", async () => {
      as(ownerId);
      const saved = await putBilling(json(`/api/branches/${branchA}/billing`, "PUT", { acctSales: "500-000", acctBank: "" }), branchCtx(branchA));
      expect(saved.status).toBe(200);
      expect((await saved.json()).billing.effectiveAccountCodes).toMatchObject({ sales: "500-000", bank: "1010" });

      const xero = rows(await (await xeroCsv(get(`/api/exports/xero-invoices.csv${q()}`))).text());
      expect(xero[0]).toBe("*ContactName,EmailAddress,*InvoiceNumber,Reference,*InvoiceDate,*DueDate,Description,*Quantity,*UnitAmount,*AccountCode,*TaxType,Currency");
      expect(xero).toHaveLength(4);
      expect(xero.find((r) => r.includes("600.00"))).toMatch(/,500-000,Tax on Sales,MYR$/);

      const journal = rows(await (await journalCsv(get(`/api/exports/journal.csv${q()}`))).text()).map((r) => r.split(","));
      expect(journal[0]).toEqual(["Date", "Account", "Debit", "Credit", "Reference", "Description"]);
      const body = journal.slice(1);
      const sum = (i: number) => body.reduce((s, r) => s + Math.round(Number(r[i]) * 100), 0);
      expect(sum(2)).toBe(sum(3));
      expect(body.some((r) => r[1] === "500-000")).toBe(true);
      expect(body.some((r) => r[1] === "2200" && r[3] === "36.00")).toBe(true);
      expect(body.some((r) => r[1] === "1010" && r[2] === "636.00")).toBe(true);
    });

    it("OWNER / ADMIN only, branch scoped; only the owner edits account codes", async () => {
      for (const user of [doctorId, deskId]) {
        as(user);
        expect((await journalCsv(get(`/api/exports/journal.csv${q()}`))).status).toBe(403);
      }
      as(outsiderId);
      expect((await invoicesCsv(get(`/api/exports/invoices.csv${q()}`))).status).toBe(404);
      as(null);
      expect((await paymentsCsv(get(`/api/exports/payments.csv${q()}`))).status).toBe(401);
      as(adminId);
      expect((await putBilling(json(`/api/branches/${branchA}/billing`, "PUT", { acctSales: "1" }), branchCtx(branchA))).status).toBe(403);
      as(ownerId);
      expect((await putBilling(json(`/api/branches/${branchA}/billing`, "PUT", { acctSales: "=cmd" }), branchCtx(branchA))).status).toBe(422);
    });
  });
});
