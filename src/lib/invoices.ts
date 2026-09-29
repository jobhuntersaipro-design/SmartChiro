import type { PaymentMethod, Prisma } from "@prisma/client";
import { clinicParts } from "@/lib/clinic-time";

/** Statuses the invoice list screen knows how to show and move between. */
export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
/** Every invoice status, including the payment-driven PARTIALLY_PAID. */
export type AnyInvoiceStatus = InvoiceStatus | "PARTIALLY_PAID";

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  /** Subject to SST when the branch charges it. Absent on older rows = taxable. */
  taxable?: boolean;
}

/** A line as entered, before totals are worked out. */
export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxable?: boolean;
}

/**
 * Overdue is derived, not stored: a sent invoice whose due date has passed.
 * (Stored OVERDUE rows from older data are treated the same.)
 */
export function effectiveInvoiceStatus(
  status: AnyInvoiceStatus,
  dueDate: Date | null,
  now: Date = new Date(),
): AnyInvoiceStatus {
  if ((status === "SENT" || status === "OVERDUE") && dueDate && dueDate.getTime() < now.getTime()) return "OVERDUE";
  if (status === "OVERDUE") return "SENT";
  return status;
}

const TRANSITIONS: Record<AnyInvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["SENT", "PAID", "CANCELLED"],
  SENT: ["PAID", "CANCELLED"],
  OVERDUE: ["PAID", "CANCELLED"],
  // Money has been taken: refund it before cancelling.
  PARTIALLY_PAID: ["PAID"],
  PAID: [],
  CANCELLED: [],
};

/** Status changes the front desk can make from here. Paid and cancelled are final (re-issue instead). */
export function allowedInvoiceTransitions(status: AnyInvoiceStatus): InvoiceStatus[] {
  return TRANSITIONS[status] ?? [];
}

export function canTransitionInvoice(from: AnyInvoiceStatus, to: InvoiceStatus): boolean {
  return allowedInvoiceTransitions(from).includes(to);
}

/**
 * Update data for cancelling an invoice. An issued invoice records when it
 * was cancelled so the accounting journal can reverse it on that date; a
 * draft never reached the books, so it gets none.
 */
export function cancelInvoiceData(from: AnyInvoiceStatus, now: Date = new Date()) {
  return { status: "CANCELLED" as const, cancelledAt: from === "DRAFT" ? null : now };
}

const MYR = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", currencyDisplay: "code" });

/** "RM 1,234.50" — the Malaysian convention, regardless of browser locale. */
export function formatMYR(amount: number): string {
  const text = MYR.format(Math.abs(amount)).replace(/^MYR\s?/, "RM ");
  return amount < 0 ? `-${text}` : text;
}

export function parseLineItems(value: unknown): InvoiceLineItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    .map((row) => ({
      description: String(row.description ?? ""),
      quantity: Number(row.quantity ?? 1),
      unitPrice: Number(row.unitPrice ?? 0),
      total: Number(row.total ?? Number(row.quantity ?? 1) * Number(row.unitPrice ?? 0)),
      ...(typeof row.taxable === "boolean" ? { taxable: row.taxable } : {}),
    }));
}

// ─── Money ───

/** Ringgit → sen, half-up. `toFixed` first so 1.005 isn't read as 1.00499… */
export function toSen(value: number): number {
  return Math.round(Number((value * 100).toFixed(6)));
}

export const fromSen = (sen: number): number => sen / 100;

// ─── SST ───

export interface TaxSettings {
  sstEnabled: boolean;
  /** Percent, e.g. 6. */
  sstRate: number;
  patientIsMalaysian: boolean;
}

export interface InvoiceTotals {
  lines: InvoiceLineItem[];
  subtotal: number;
  /** Sum of taxable lines when SST applies, else 0. */
  taxableBase: number;
  taxApplied: boolean;
  /** The rate charged, or null when no SST applies. */
  taxRate: number | null;
  taxAmount: number;
  taxLabel: string | null;
  total: number;
}

/**
 * Line totals, subtotal, SST and grand total, all rounded to the sen
 * (half-up). SST applies to taxable lines only when the branch charges it and
 * the patient is not Malaysian (chiropractic services to non-citizens, from
 * 1 Jul 2025). Tax is worked out on the taxable base, not per line.
 */
export function computeTotals(inputs: InvoiceLineInput[], settings: TaxSettings): InvoiceTotals {
  const taxApplied = settings.sstEnabled && !settings.patientIsMalaysian && settings.sstRate > 0;
  let subtotalSen = 0;
  let baseSen = 0;
  const lines = inputs.map((line) => {
    const taxable = line.taxable ?? true;
    const totalSen = Math.round(line.quantity * toSen(line.unitPrice));
    subtotalSen += totalSen;
    if (taxable) baseSen += totalSen;
    return {
      description: line.description,
      quantity: line.quantity,
      unitPrice: fromSen(toSen(line.unitPrice)),
      total: fromSen(totalSen),
      taxable,
    };
  });
  if (!taxApplied) baseSen = 0;
  const rateBp = Math.round(settings.sstRate * 100);
  const taxSen = taxApplied ? Math.floor((baseSen * rateBp + 5000) / 10000) : 0;
  const rate = rateBp / 100;
  return {
    lines,
    subtotal: fromSen(subtotalSen),
    taxableBase: fromSen(baseSen),
    taxApplied,
    taxRate: taxApplied ? rate : null,
    taxAmount: fromSen(taxSen),
    taxLabel: taxApplied ? `SST ${rate}%` : null,
    total: fromSen(subtotalSen + taxSen),
  };
}

/** 12 digits (dashes optional) starting with a real YYMMDD birth date. */
export function isValidMyKad(ic: string | null | undefined): boolean {
  if (!ic) return false;
  const digits = ic.trim().replace(/-/g, "");
  if (!/^\d{12}$/.test(digits)) return false;
  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1) return false;
  const leap = yy % 4 === 0; // 19yy and 20yy agree except 1900, and 00 is read as 2000
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
  return dd <= days;
}

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

/**
 * A patient nationality from a form: ISO 3166-1 alpha-2, upper-cased.
 * `null` for blank, `"invalid"` for anything that isn't a known country code.
 */
export function parseNationality(value: unknown): string | null | "invalid" {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return "invalid";
  const code = value.trim().toUpperCase();
  if (!code) return null;
  if (!/^[A-Z]{2}$/.test(code)) return "invalid";
  // User-assigned / exceptionally reserved codes that ICU still names.
  if (/^(AA|Q[M-Z]|X[A-Z]|ZZ|EU|EZ|UN|UK)$/.test(code)) return "invalid";
  let name: string | undefined;
  try {
    name = REGION_NAMES.of(code);
  } catch {
    return "invalid";
  }
  return name && name !== code && name !== "Unknown Region" ? code : "invalid";
}

/** Nationality MY, or no nationality recorded but a valid MyKad IC. */
export function isMalaysianPatient(p: { nationality?: string | null; icNumber?: string | null }): boolean {
  const nationality = p.nationality?.trim().toUpperCase();
  if (nationality) return nationality === "MY";
  return isValidMyKad(p.icNumber);
}

// ─── Status from payments ───

/**
 * Status after payments change: DRAFT/SENT stay until money comes in, then
 * PARTIALLY_PAID, then PAID once the balance is zero. A full refund puts a
 * paid invoice back to SENT. CANCELLED is sticky.
 */
export function invoiceStatusFor(total: number, paid: number, current: AnyInvoiceStatus): AnyInvoiceStatus {
  if (current === "CANCELLED") return "CANCELLED";
  const totalSen = toSen(total);
  const paidSen = toSen(paid);
  if (paidSen > 0 && paidSen >= totalSen) return "PAID";
  if (paidSen > 0) return "PARTIALLY_PAID";
  if (current === "PAID" || current === "PARTIALLY_PAID") return "SENT";
  return current;
}

// ─── Payment methods ───

export const PAYMENT_METHODS = ["CASH", "CARD", "DUITNOW_QR", "FPX", "EWALLET", "BANK_TRANSFER", "PANEL"] as const satisfies readonly PaymentMethod[];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  DUITNOW_QR: "DuitNow QR",
  FPX: "FPX",
  EWALLET: "e-Wallet",
  BANK_TRANSFER: "Bank transfer",
  PANEL: "Panel / TPA",
};

// ─── Document numbers ───

export type DocumentKind = "invoice" | "receipt";

/** Upper-case initials of the branch name ("SmartChiro KLCC" → "SK"), at most 4. */
export function branchInitials(name: string): string {
  const initials = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join("")
    .slice(0, 4);
  return initials || "SC";
}

export function documentPrefix(branch: { invoicePrefix: string | null; name: string }): string {
  const custom = branch.invoicePrefix?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return custom || branchInitials(branch.name);
}

/** `INV-SK-2026-00001` / `RCP-SK-2026-00001`. */
export function formatDocumentNumber(kind: DocumentKind, prefix: string, year: number, seq: number): string {
  return `${kind === "invoice" ? "INV" : "RCP"}-${prefix}-${year}-${String(seq).padStart(5, "0")}`;
}

type Tx = Prisma.TransactionClient;
type SeqRow = { seq: number; prefix: string | null; name: string };

async function bumpSequence(tx: Tx, branchId: string, kind: DocumentKind): Promise<SeqRow> {
  const rows =
    kind === "invoice"
      ? await tx.$queryRaw<SeqRow[]>`
          UPDATE "Branch" SET "invoiceSeq" = "invoiceSeq" + 1 WHERE "id" = ${branchId}
          RETURNING "invoiceSeq" AS seq, "invoicePrefix" AS prefix, "name"`
      : await tx.$queryRaw<SeqRow[]>`
          UPDATE "Branch" SET "receiptSeq" = "receiptSeq" + 1 WHERE "id" = ${branchId}
          RETURNING "receiptSeq" AS seq, "invoicePrefix" AS prefix, "name"`;
  if (!rows[0]) throw new InvoiceError("branch_not_found", 404);
  return rows[0];
}

/**
 * Next invoice/receipt number for a branch. The UPDATE ... RETURNING row lock
 * serialises concurrent callers until their transaction ends. Two branches
 * can share initials, so a number already taken elsewhere is skipped.
 */
export async function nextNumber(tx: Tx, branchId: string, kind: DocumentKind, now: Date = new Date()): Promise<string> {
  const year = clinicParts(now).year;
  for (let attempt = 0; attempt < 50; attempt++) {
    const row = await bumpSequence(tx, branchId, kind);
    const number = formatDocumentNumber(kind, documentPrefix({ invoicePrefix: row.prefix, name: row.name }), year, Number(row.seq));
    const taken =
      kind === "invoice"
        ? await tx.invoice.findUnique({ where: { invoiceNumber: number }, select: { id: true } })
        : await tx.payment.findUnique({ where: { receiptNumber: number }, select: { id: true } });
    if (!taken) return number;
  }
  throw new InvoiceError("number_sequence_exhausted", 409);
}

// ─── Creating invoices and recording payments ───

/** A business-rule failure a route turns into a JSON error. */
export class InvoiceError extends Error {
  constructor(
    public code: string,
    public status: number = 422,
    public details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "InvoiceError";
  }
}

export interface CreateInvoiceInput {
  branchId: string;
  patientId: string;
  lines: InvoiceLineInput[];
  dueDate?: Date | null;
  notes?: string | null;
  appointmentId?: string | null;
  status?: "DRAFT" | "SENT";
  issuedAt?: Date;
}

/**
 * Creates an invoice with a per-branch number and SST worked out from the
 * branch settings and the patient's nationality. Call inside
 * `prisma.$transaction(async (tx) => ...)`. Callers check access and that the
 * patient belongs to the branch.
 */
export async function createInvoice(tx: Tx, input: CreateInvoiceInput) {
  if (input.lines.length === 0) throw new InvoiceError("no_line_items");
  const [branch, patient] = await Promise.all([
    tx.branch.findUnique({ where: { id: input.branchId }, select: { sstEnabled: true, sstRate: true } }),
    tx.patient.findUnique({ where: { id: input.patientId }, select: { nationality: true, icNumber: true } }),
  ]);
  if (!branch) throw new InvoiceError("branch_not_found", 404);
  if (!patient) throw new InvoiceError("patient_not_found", 404);

  const totals = computeTotals(input.lines, {
    sstEnabled: branch.sstEnabled,
    sstRate: Number(branch.sstRate),
    patientIsMalaysian: isMalaysianPatient(patient),
  });
  const issuedAt = input.issuedAt ?? new Date();
  const invoiceNumber = await nextNumber(tx, input.branchId, "invoice", issuedAt);

  return tx.invoice.create({
    data: {
      invoiceNumber,
      amount: totals.total,
      subtotal: totals.subtotal,
      taxRate: totals.taxRate,
      taxAmount: totals.taxAmount,
      taxLabel: totals.taxLabel,
      currency: "MYR",
      status: input.status ?? "DRAFT",
      issuedAt,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      lineItems: totals.lines as unknown as Prisma.InputJsonValue,
      patientId: input.patientId,
      branchId: input.branchId,
      appointmentId: input.appointmentId ?? null,
    },
  });
}

export interface RecordPaymentInput {
  invoiceId: string;
  /** Ringgit; negative for a refund. */
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  receivedAt?: Date;
  receivedById?: string | null;
  notes?: string | null;
  refundReason?: string | null;
}

/**
 * Records a payment (or refund) with a receipt number and moves the invoice's
 * amountPaid / status / paidAt in the same transaction. The invoice row is
 * locked first so concurrent payments can't both pass the overpayment check.
 * Callers check access (refunds are OWNER/ADMIN only).
 */
export async function recordPayment(tx: Tx, input: RecordPaymentInput) {
  await tx.$queryRaw`SELECT 1 FROM "Invoice" WHERE "id" = ${input.invoiceId} FOR UPDATE`;
  const invoice = await tx.invoice.findUnique({
    where: { id: input.invoiceId },
    select: { id: true, branchId: true, amount: true, amountPaid: true, status: true, paidAt: true },
  });
  if (!invoice) throw new InvoiceError("not_found", 404);
  if (invoice.status === "CANCELLED") throw new InvoiceError("invoice_cancelled");

  const amountSen = toSen(input.amount);
  const totalSen = toSen(Number(invoice.amount));
  const paidSen = toSen(Number(invoice.amountPaid));
  if (amountSen === 0) throw new InvoiceError("validation", 422, { field: "amount" });
  if (amountSen > 0 && paidSen + amountSen > totalSen) {
    throw new InvoiceError("overpayment", 422, { balance: fromSen(totalSen - paidSen) });
  }
  if (amountSen < 0) {
    if (!input.refundReason?.trim()) throw new InvoiceError("refund_reason_required");
    if (-amountSen > paidSen) throw new InvoiceError("refund_exceeds_paid", 422, { amountPaid: fromSen(paidSen) });
  }

  const receivedAt = input.receivedAt ?? new Date();
  const receiptNumber = await nextNumber(tx, invoice.branchId, "receipt", receivedAt);
  const payment = await tx.payment.create({
    data: {
      invoiceId: invoice.id,
      branchId: invoice.branchId,
      amount: fromSen(amountSen),
      method: input.method,
      reference: input.reference?.trim() || null,
      receivedAt,
      receivedById: input.receivedById ?? null,
      notes: input.notes?.trim() || null,
      refundReason: amountSen < 0 ? input.refundReason!.trim() : null,
      receiptNumber,
    },
  });

  const newPaidSen = paidSen + amountSen;
  const current = invoice.status as AnyInvoiceStatus;
  const status = invoiceStatusFor(fromSen(totalSen), fromSen(newPaidSen), current);
  const paidAt = status === "PAID" ? (current === "PAID" ? invoice.paidAt : receivedAt) : null;
  const updated = await tx.invoice.update({
    where: { id: invoice.id },
    data: { amountPaid: fromSen(newPaidSen), status, paidAt },
  });
  return { payment, invoice: updated };
}
