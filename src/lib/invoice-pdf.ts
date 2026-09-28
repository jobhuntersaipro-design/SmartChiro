import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMYR, type InvoiceLineItem } from "@/lib/invoices";
import { clinicDateLabel } from "@/lib/clinic-time";

export interface PdfPaymentRow {
  receivedAt: Date;
  receiptNumber: string;
  method: string;
  reference: string | null;
  amount: number;
}

export interface PdfTotals {
  subtotal: number;
  /** e.g. "SST 6%"; null when no tax was charged. */
  taxLabel: string | null;
  taxAmount: number;
  total: number;
  paid: number;
  balance: number;
}

export interface InvoicePdfData {
  /** INVOICE, or RECEIPT for a fully paid invoice / a single payment. */
  kind: "INVOICE" | "RECEIPT";
  invoiceNumber: string;
  issuedAt: Date;
  dueDate: Date | null;
  paidAt: Date | null;
  statusLabel: string;
  /** Legal name (or branch name), SSM / TIN / SST lines, then address and contact. */
  clinic: { name: string; registrations: string[]; lines: string[] };
  patient: { name: string; lines: string[] };
  items: InvoiceLineItem[];
  totals: PdfTotals;
  payments: PdfPaymentRow[];
  /** Set for a receipt of one payment: shows that payment instead of the line items. */
  payment?: PdfPaymentRow & { refundReason: string | null; paidToDate: number; balanceAfter: number };
  notes: string | null;
  paymentInstructions: string | null;
}

const INK = rgb(0.04, 0.15, 0.25);
const MUTED = rgb(0.41, 0.45, 0.53);
const RULE = rgb(0.89, 0.91, 0.93);
const BRAND = rgb(0.39, 0.36, 1);

const PAGE: [number, number] = [595.28, 841.89];
const LEFT = 48;
const RIGHT = 547;
const BOTTOM = 64;

/** dd/mm/yyyy on the clinic calendar. */
const date = (d: Date) => clinicDateLabel(d, "numeric");

/** Standard fonts are WinAnsi-only; drop anything they can't draw rather than failing the whole PDF. */
const safe = (text: string) => text.replace(/[^\x20-\x7E -ÿ]/g, "?");

interface Fonts {
  font: PDFFont;
  bold: PDFFont;
}

/** A top-down writer that starts a new page when it runs out of room. */
class Cursor {
  page: PDFPage;
  y = 790;

  constructor(
    private pdf: PDFDocument,
    public fonts: Fonts,
  ) {
    this.page = pdf.addPage(PAGE);
  }

  ensure(height: number) {
    if (this.y - height >= BOTTOM) return;
    this.page = this.pdf.addPage(PAGE);
    this.y = 790;
  }

  text(value: string, x: number, size = 10, color = INK, bold = false) {
    this.page.drawText(safe(value), { x, y: this.y, size, font: bold ? this.fonts.bold : this.fonts.font, color });
  }

  right(value: string, right: number, size = 10, color = INK, bold = false) {
    const f = bold ? this.fonts.bold : this.fonts.font;
    const v = safe(value);
    this.page.drawText(v, { x: right - f.widthOfTextAtSize(v, size), y: this.y, size, font: f, color });
  }

  rule(from = LEFT, to = RIGHT) {
    this.page.drawLine({ start: { x: from, y: this.y }, end: { x: to, y: this.y }, thickness: 0.6, color: RULE });
  }

  /** Wrapped paragraph (keeps explicit line breaks). */
  paragraph(value: string, size = 9, color = INK, width = RIGHT - LEFT) {
    for (const line of wrap(value, this.fonts.font, size, width)) {
      this.ensure(12);
      this.text(line, LEFT, size, color);
      this.y -= 12;
    }
  }
}

function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const raw of value.split(/\r?\n/).map(safe)) {
    let line = "";
    for (const word of raw.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > width) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

function header(c: Cursor, data: InvoicePdfData) {
  const title = data.payment ? (data.payment.amount < 0 ? "REFUND" : "RECEIPT") : data.kind;
  c.text(data.clinic.name, LEFT, 16, INK, true);
  c.right(title, RIGHT, 20, BRAND, true);
  const top = c.y;
  c.y -= 18;
  for (const line of [...data.clinic.registrations, ...data.clinic.lines]) {
    c.text(line, LEFT, 9, MUTED);
    c.y -= 12;
  }
  const left = c.y;

  const meta: [string, string][] = data.payment
    ? [
        [data.payment.amount < 0 ? "Refund no." : "Receipt no.", data.payment.receiptNumber],
        ["Date", date(data.payment.receivedAt)],
        ["Invoice no.", data.invoiceNumber],
      ]
    : [
        [data.kind === "RECEIPT" ? "Receipt for" : "Invoice no.", data.invoiceNumber],
        ["Issued", date(data.issuedAt)],
        ...(data.dueDate && data.kind === "INVOICE" ? [["Due", date(data.dueDate)] as [string, string]] : []),
        ...(data.paidAt ? [["Paid", date(data.paidAt)] as [string, string]] : []),
        ["Status", data.statusLabel],
      ];
  c.y = top - 24;
  for (const [label, value] of meta) {
    c.right(`${label}: ${value}`, RIGHT, 9, MUTED);
    c.y -= 12;
  }
  c.y = Math.min(left, c.y) - 24;

  c.text(data.payment ? (data.payment.amount < 0 ? "REFUNDED TO" : "RECEIVED FROM") : "BILL TO", LEFT, 8, MUTED, true);
  c.y -= 14;
  c.text(data.patient.name, LEFT, 11, INK, true);
  c.y -= 13;
  for (const line of data.patient.lines) {
    c.text(line, LEFT, 9, MUTED);
    c.y -= 12;
  }
  c.y -= 20;
}

function lineItems(c: Cursor, data: InvoicePdfData) {
  const cols = { qty: 380, unit: 460 };
  const markTaxable = data.totals.taxAmount > 0;
  c.text("Description", LEFT, 9, MUTED, true);
  c.right("Qty", cols.qty, 9, MUTED, true);
  c.right("Unit price", cols.unit, 9, MUTED, true);
  c.right("Amount", RIGHT, 9, MUTED, true);
  c.y -= 6;
  c.rule();
  c.y -= 16;
  for (const item of data.items) {
    c.ensure(18);
    const mark = markTaxable && item.taxable !== false ? " *" : "";
    c.text(`${item.description.slice(0, 60)}${mark}`, LEFT);
    c.right(String(item.quantity), cols.qty);
    c.right(formatMYR(item.unitPrice), cols.unit);
    c.right(formatMYR(item.total), RIGHT);
    c.y -= 18;
  }
  if (markTaxable) {
    c.text(`* Subject to ${data.totals.taxLabel ?? "SST"}`, LEFT, 8, MUTED);
  }
}

function totalsBlock(c: Cursor, rows: [string, number, boolean][]) {
  c.ensure(rows.length * 16 + 12);
  c.y += 6;
  c.rule(330);
  c.y -= 16;
  for (const [label, amount, strong] of rows) {
    c.text(label, 330, strong ? 11 : 10, INK, strong);
    c.right(formatMYR(amount), RIGHT, strong ? 12 : 10, INK, strong);
    c.y -= 16;
  }
}

function paymentsTable(c: Cursor, payments: PdfPaymentRow[]) {
  if (payments.length === 0) return;
  c.y -= 16;
  c.ensure(40);
  c.text("PAYMENTS", LEFT, 8, MUTED, true);
  c.y -= 14;
  c.text("Date", LEFT, 9, MUTED, true);
  c.text("Receipt no.", 120, 9, MUTED, true);
  c.text("Method", 260, 9, MUTED, true);
  c.text("Reference", 360, 9, MUTED, true);
  c.right("Amount", RIGHT, 9, MUTED, true);
  c.y -= 6;
  c.rule();
  c.y -= 14;
  for (const p of payments) {
    c.ensure(16);
    c.text(date(p.receivedAt), LEFT, 9);
    c.text(p.receiptNumber.slice(0, 26), 120, 9);
    c.text(p.method, 260, 9);
    c.text((p.reference ?? "").slice(0, 24), 360, 9);
    c.right(formatMYR(p.amount), RIGHT, 9);
    c.y -= 16;
  }
}

function singlePayment(c: Cursor, data: InvoicePdfData) {
  const p = data.payment!;
  c.text("Description", LEFT, 9, MUTED, true);
  c.right("Amount", RIGHT, 9, MUTED, true);
  c.y -= 6;
  c.rule();
  c.y -= 16;
  c.text(`${p.amount < 0 ? "Refund" : "Payment"} for invoice ${data.invoiceNumber}`, LEFT);
  c.right(formatMYR(p.amount), RIGHT);
  c.y -= 14;
  c.text(`Method: ${p.method}${p.reference ? `  ·  Ref: ${p.reference}` : ""}`, LEFT, 9, MUTED);
  c.y -= 12;
  if (p.refundReason) {
    c.text(`Reason: ${p.refundReason.slice(0, 90)}`, LEFT, 9, MUTED);
    c.y -= 12;
  }
  c.y -= 10;
  totalsBlock(c, [
    ["Invoice total", data.totals.total, false],
    ["Paid to date", p.paidToDate, false],
    ["Balance due", p.balanceAfter, true],
  ]);
}

/** A4 invoice, paid-invoice receipt, or single-payment receipt. */
export async function renderInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const name = data.payment ? `Receipt ${data.payment.receiptNumber}` : `${data.kind === "RECEIPT" ? "Receipt" : "Invoice"} ${data.invoiceNumber}`;
  pdf.setTitle(name);
  const c = new Cursor(pdf, {
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  });

  header(c, data);
  if (data.payment) {
    singlePayment(c, data);
  } else {
    lineItems(c, data);
    c.y -= 10;
    const t = data.totals;
    const showTax = t.taxAmount > 0 && t.taxLabel;
    totalsBlock(c, [
      ...(showTax ? ([["Subtotal", t.subtotal, false], [t.taxLabel!, t.taxAmount, false]] as [string, number, boolean][]) : []),
      ["Total", t.total, true],
      ...(t.paid !== 0 ? ([["Paid", t.paid, false], ["Balance due", t.balance, true]] as [string, number, boolean][]) : []),
    ]);
    paymentsTable(c, data.payments);
  }

  if (data.notes && !data.payment) {
    c.y -= 20;
    c.ensure(30);
    c.text("Notes", LEFT, 9, MUTED, true);
    c.y -= 13;
    c.paragraph(data.notes);
  }
  if (data.paymentInstructions && !data.payment && data.totals.balance > 0) {
    c.y -= 16;
    c.ensure(30);
    c.text("How to pay", LEFT, 9, MUTED, true);
    c.y -= 13;
    c.paragraph(data.paymentInstructions);
  }

  const pages = pdf.getPages();
  for (const page of pages) {
    page.drawText("Thank you. Generated by SmartChiro.", { x: LEFT, y: 40, size: 8, font: c.fonts.font, color: MUTED });
  }
  return pdf.save();
}
