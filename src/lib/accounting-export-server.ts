import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseLineItems, type AnyInvoiceStatus } from "@/lib/invoices";
import { csvFileName } from "@/lib/reports/csv";
import { resolveReportRequest, type ReportRequest } from "@/lib/reports/server";
import {
  ACCOUNT_CODE_SELECT,
  accountCodesOf,
  invoicesCsv,
  journalCsv,
  journalLines,
  paymentsCsv,
  xeroInvoicesCsv,
  type AccountCodes,
  type AccountingExportKind,
  type ExportInvoice,
  type ExportPayment,
} from "@/lib/accounting-export";

/**
 * GET /api/exports/{invoices,payments,xero-invoices,journal}.csv
 * `?branchId=&from=&to=` like the reports (branch scope, clinic days, `to`
 * inclusive); `accounting.export` (OWNER / ADMIN). Invoices by issue date
 * (drafts excluded) — the journal also loads invoices cancelled in the range
 * to reverse them — payments by date received.
 */

const patientName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

async function loadInvoices(ctx: ReportRequest, withCancellations = false): Promise<ExportInvoice[]> {
  const inRange = { gte: ctx.range.start, lt: ctx.range.end };
  const rows = await prisma.invoice.findMany({
    where: {
      branchId: { in: ctx.branchIds },
      status: { not: "DRAFT" },
      ...(withCancellations ? { OR: [{ issuedAt: inRange }, { cancelledAt: inRange }] } : { issuedAt: inRange }),
    },
    orderBy: [{ issuedAt: "asc" }, { invoiceNumber: "asc" }],
    select: {
      invoiceNumber: true,
      issuedAt: true,
      dueDate: true,
      status: true,
      branchId: true,
      currency: true,
      amount: true,
      taxAmount: true,
      taxLabel: true,
      amountPaid: true,
      lineItems: true,
      cancelledAt: true,
      patient: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  return rows.map((r) => ({
    invoiceNumber: r.invoiceNumber,
    issuedAt: r.issuedAt,
    dueDate: r.dueDate,
    status: r.status as AnyInvoiceStatus,
    branchId: r.branchId,
    branchName: ctx.branchNames.get(r.branchId) ?? "",
    patientName: patientName(r.patient),
    patientEmail: r.patient.email,
    currency: r.currency,
    amount: Number(r.amount),
    taxAmount: r.taxAmount === null ? null : Number(r.taxAmount),
    taxLabel: r.taxLabel,
    amountPaid: Number(r.amountPaid),
    lineItems: parseLineItems(r.lineItems),
    cancelledAt: r.cancelledAt,
  }));
}

async function loadPayments(ctx: ReportRequest): Promise<ExportPayment[]> {
  const rows = await prisma.payment.findMany({
    where: { branchId: { in: ctx.branchIds }, receivedAt: { gte: ctx.range.start, lt: ctx.range.end } },
    orderBy: [{ receivedAt: "asc" }, { receiptNumber: "asc" }],
    select: {
      receiptNumber: true,
      receivedAt: true,
      branchId: true,
      method: true,
      reference: true,
      amount: true,
      refundReason: true,
      invoice: { select: { invoiceNumber: true, patient: { select: { firstName: true, lastName: true } } } },
    },
  });
  return rows.map((r) => ({
    receiptNumber: r.receiptNumber,
    receivedAt: r.receivedAt,
    branchId: r.branchId,
    branchName: ctx.branchNames.get(r.branchId) ?? "",
    invoiceNumber: r.invoice.invoiceNumber,
    patientName: patientName(r.invoice.patient),
    method: r.method,
    reference: r.reference,
    amount: Number(r.amount),
    refundReason: r.refundReason,
  }));
}

async function loadCodes(branchIds: string[]): Promise<(branchId: string) => AccountCodes> {
  const branches = await prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, ...ACCOUNT_CODE_SELECT } });
  const byId = new Map(branches.map((b) => [b.id, accountCodesOf(b)]));
  return (id) => byId.get(id) ?? accountCodesOf({});
}

async function buildCsv(kind: AccountingExportKind, ctx: ReportRequest): Promise<string> {
  switch (kind) {
    case "invoices":
      return invoicesCsv(await loadInvoices(ctx), ctx.now);
    case "payments":
      return paymentsCsv(await loadPayments(ctx));
    case "xero-invoices": {
      const [invoices, codes] = await Promise.all([loadInvoices(ctx), loadCodes(ctx.branchIds)]);
      return xeroInvoicesCsv(invoices, codes);
    }
    case "journal": {
      const [invoices, payments, codes] = await Promise.all([loadInvoices(ctx, true), loadPayments(ctx), loadCodes(ctx.branchIds)]);
      return journalCsv(journalLines(invoices, payments, codes, ctx.range));
    }
  }
}

/** Shared handler for the four export routes. */
export async function accountingExportResponse(req: Request, kind: AccountingExportKind): Promise<Response> {
  const ctx = await resolveReportRequest(req, "accounting.export");
  if (ctx instanceof NextResponse) return ctx;
  const csv = await buildCsv(kind, ctx);
  const scope = ctx.scope.branchIds.length > 1 ? "all-branches" : ctx.scope.label;
  const fileName = csvFileName([kind, scope], ctx.range);
  // BOM on the spreadsheet listings so Excel reads UTF-8 names; none on the
  // import files, where it would corrupt the first column header.
  const bom = kind === "invoices" || kind === "payments" ? "\uFEFF" : "";
  return new Response(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
