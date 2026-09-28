import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  InvoiceError,
  PAYMENT_METHOD_LABEL,
  effectiveInvoiceStatus,
  fromSen,
  isMalaysianPatient,
  parseLineItems,
  toSen,
  type AnyInvoiceStatus,
} from "@/lib/invoices";
import type { InvoicePdfData, PdfPaymentRow } from "@/lib/invoice-pdf";
import { clinicDayBounds, clinicInstantFromInputs, clinicTimeInput } from "@/lib/clinic-time";

/** JSON response for a business-rule error from the invoices lib; rethrows anything else. */
export function invoiceErrorResponse(err: unknown): Response {
  if (err instanceof InvoiceError) {
    return NextResponse.json({ error: err.code, ...(err.details ?? {}) }, { status: err.status });
  }
  throw err;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A payment's received-at: "YYYY-MM-DD" is that clinic day at the current
 * clinic time; anything else must be an ISO timestamp. Null when invalid.
 */
export function parseReceivedAt(value: string | null | undefined, now: Date = new Date()): Date | null {
  if (!value) return now;
  const d = ISO_DATE.test(value) ? clinicInstantFromInputs(value, clinicTimeInput(now)) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A due date entered as "YYYY-MM-DD" lasts to the end of that clinic day. */
export function dueDateFromInput(value: string): Date {
  return new Date(clinicDayBounds(value).end.getTime() - 1);
}

/** Everything an invoice screen, PDF or receipt needs, in one query. */
export async function loadInvoiceDetail(invoiceId: string) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      patient: {
        select: { id: true, firstName: true, lastName: true, icNumber: true, nationality: true, phone: true, email: true },
      },
      branch: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          phone: true,
          email: true,
          legalName: true,
          ssmRegNo: true,
          tin: true,
          sstRegNo: true,
          sstEnabled: true,
          sstRate: true,
          paymentInstructions: true,
        },
      },
      payments: {
        orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
        include: { receivedBy: { select: { id: true, name: true } } },
      },
    },
  });
}

export type InvoiceDetailRow = NonNullable<Awaited<ReturnType<typeof loadInvoiceDetail>>>;

export const INVOICE_STATUS_LABEL: Record<AnyInvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Awaiting payment",
  OVERDUE: "Overdue",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

/** Stored money figures as numbers; older invoices have no subtotal/tax snapshot. */
export function invoiceFigures(inv: Pick<InvoiceDetailRow, "amount" | "amountPaid" | "subtotal" | "taxAmount">) {
  const totalSen = toSen(Number(inv.amount));
  const paidSen = toSen(Number(inv.amountPaid));
  return {
    subtotal: inv.subtotal === null ? fromSen(totalSen) : Number(inv.subtotal),
    taxAmount: inv.taxAmount === null ? 0 : Number(inv.taxAmount),
    total: fromSen(totalSen),
    amountPaid: fromSen(paidSen),
    balance: fromSen(totalSen - paidSen),
  };
}

export function serializePayment(p: InvoiceDetailRow["payments"][number]) {
  return {
    id: p.id,
    amount: Number(p.amount),
    isRefund: Number(p.amount) < 0,
    method: p.method,
    methodLabel: PAYMENT_METHOD_LABEL[p.method],
    reference: p.reference,
    receivedAt: p.receivedAt.toISOString(),
    receivedBy: p.receivedBy ? { id: p.receivedBy.id, name: p.receivedBy.name } : null,
    notes: p.notes,
    receiptNumber: p.receiptNumber,
    refundReason: p.refundReason,
    createdAt: p.createdAt.toISOString(),
  };
}

export function serializeInvoiceDetail(inv: InvoiceDetailRow, now: Date = new Date()) {
  const figures = invoiceFigures(inv);
  const { branch, patient } = inv;
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: effectiveInvoiceStatus(inv.status as AnyInvoiceStatus, inv.dueDate, now),
    currency: inv.currency,
    issuedAt: inv.issuedAt.toISOString(),
    dueDate: inv.dueDate?.toISOString() ?? null,
    paidAt: inv.paidAt?.toISOString() ?? null,
    notes: inv.notes,
    appointmentId: inv.appointmentId,
    lineItems: parseLineItems(inv.lineItems),
    ...figures,
    amount: figures.total,
    taxRate: inv.taxRate === null ? null : Number(inv.taxRate),
    taxLabel: inv.taxLabel,
    patient: {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      icNumber: patient.icNumber,
      nationality: patient.nationality,
      isMalaysian: isMalaysianPatient(patient),
    },
    branch: {
      id: branch.id,
      name: branch.name,
      legalName: branch.legalName,
      ssmRegNo: branch.ssmRegNo,
      tin: branch.tin,
      sstRegNo: branch.sstRegNo,
      sstEnabled: branch.sstEnabled,
      sstRate: Number(branch.sstRate),
      paymentInstructions: branch.paymentInstructions,
    },
    payments: inv.payments.map(serializePayment),
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  };
}

function clinicBlock(branch: InvoiceDetailRow["branch"]): InvoicePdfData["clinic"] {
  const registrations = [
    branch.legalName && branch.legalName !== branch.name ? `Trading as ${branch.name}` : null,
    branch.ssmRegNo ? `SSM ${branch.ssmRegNo}` : null,
    [branch.tin ? `TIN ${branch.tin}` : null, branch.sstRegNo ? `SST ${branch.sstRegNo}` : null].filter(Boolean).join("  ·  ") || null,
  ];
  return {
    name: branch.legalName || branch.name,
    registrations: registrations.filter((line): line is string => Boolean(line)),
    lines: [
      branch.address,
      [branch.zip, branch.city, branch.state].filter(Boolean).join(" "),
      [branch.phone, branch.email].filter(Boolean).join("  ·  "),
    ].filter((line): line is string => Boolean(line)),
  };
}

function pdfPayment(p: InvoiceDetailRow["payments"][number]): PdfPaymentRow {
  return {
    receivedAt: p.receivedAt,
    receiptNumber: p.receiptNumber,
    method: PAYMENT_METHOD_LABEL[p.method],
    reference: p.reference,
    amount: Number(p.amount),
  };
}

/** The whole invoice: a receipt once it is paid in full. */
export function invoicePdfData(inv: InvoiceDetailRow, now: Date = new Date()): InvoicePdfData {
  const status = effectiveInvoiceStatus(inv.status as AnyInvoiceStatus, inv.dueDate, now);
  const figures = invoiceFigures(inv);
  const { patient } = inv;
  return {
    kind: status === "PAID" ? "RECEIPT" : "INVOICE",
    invoiceNumber: inv.invoiceNumber,
    issuedAt: inv.issuedAt,
    dueDate: inv.dueDate,
    paidAt: inv.paidAt,
    statusLabel: INVOICE_STATUS_LABEL[status],
    clinic: clinicBlock(inv.branch),
    patient: {
      name: `${patient.firstName} ${patient.lastName}`,
      lines: [patient.icNumber ? `IC ${patient.icNumber}` : null, patient.phone, patient.email].filter(
        (line): line is string => Boolean(line),
      ),
    },
    items: parseLineItems(inv.lineItems),
    totals: {
      subtotal: figures.subtotal,
      taxLabel: inv.taxLabel,
      taxAmount: figures.taxAmount,
      total: figures.total,
      paid: figures.amountPaid,
      balance: figures.balance,
    },
    payments: inv.payments.map(pdfPayment),
    notes: inv.notes,
    paymentInstructions: inv.branch.paymentInstructions,
  };
}

/** A receipt for one payment, with the balance as it stood after that payment. */
export function paymentReceiptPdfData(inv: InvoiceDetailRow, paymentId: string, now: Date = new Date()): InvoicePdfData | null {
  const index = inv.payments.findIndex((p) => p.id === paymentId);
  if (index < 0) return null;
  const base = invoicePdfData(inv, now);
  const paidToDateSen = inv.payments.slice(0, index + 1).reduce((sum, p) => sum + toSen(Number(p.amount)), 0);
  const payment = inv.payments[index];
  return {
    ...base,
    kind: "RECEIPT",
    payment: {
      ...pdfPayment(payment),
      refundReason: payment.refundReason,
      paidToDate: fromSen(paidToDateSen),
      balanceAfter: fromSen(toSen(base.totals.total) - paidToDateSen),
    },
  };
}
