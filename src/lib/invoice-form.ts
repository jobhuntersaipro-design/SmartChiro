import { computeTotals, formatMYR, toSen, type InvoiceLineInput, type InvoiceTotals } from "@/lib/invoices";

/**
 * Pure state helpers for the invoice screens (new-invoice line editor,
 * record-payment and refund dialogs). Client-safe.
 */

/** One row of the line-items editor, as typed. */
export interface LineDraft {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxable: boolean;
}

let lineCounter = 0;

export function blankLine(): LineDraft {
  lineCounter += 1;
  return { key: `line-${lineCounter}`, description: "", quantity: "1", unitPrice: "", taxable: true };
}

/** Ringgit typed by a person ("1,250.5" ok): ≥ 0, at most 2 decimals. Null when not a valid amount. */
export function parseMoney(text: string): number | null {
  const clean = text.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(clean) && !/^\.\d{1,2}$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

/** Quantity: > 0, at most 10,000, at most 2 decimals. */
export function parseQuantity(text: string): number | null {
  const value = parseMoney(text);
  return value !== null && value > 0 && value <= 10_000 ? value : null;
}

export type LineErrors = Partial<Record<"description" | "quantity" | "unitPrice", string>>;

export interface LinesCheck {
  lines: InvoiceLineInput[];
  errors: Record<string, LineErrors>;
  /** At least one line and no errors. */
  valid: boolean;
}

const isBlank = (d: LineDraft) => !d.description.trim() && !d.unitPrice.trim();

/** Validates the editor rows. Rows left completely empty are ignored. */
export function checkLines(drafts: LineDraft[]): LinesCheck {
  const lines: InvoiceLineInput[] = [];
  const errors: Record<string, LineErrors> = {};
  for (const d of drafts) {
    if (isBlank(d)) continue;
    const e: LineErrors = {};
    const description = d.description.trim();
    const quantity = parseQuantity(d.quantity);
    const unitPrice = parseMoney(d.unitPrice);
    if (!description) e.description = "Describe the item";
    else if (description.length > 200) e.description = "200 characters at most";
    if (quantity === null) e.quantity = "Quantity above 0";
    if (unitPrice === null) e.unitPrice = "Enter a price, e.g. 150.00";
    else if (unitPrice > 1_000_000) e.unitPrice = "Too large";
    if (Object.keys(e).length) errors[d.key] = e;
    else lines.push({ description, quantity: quantity!, unitPrice: unitPrice!, taxable: d.taxable });
  }
  return { lines, errors, valid: lines.length > 0 && Object.keys(errors).length === 0 };
}

export interface TaxPreviewInput {
  /** Branch billing settings; null when the caller can't read them. */
  branch: { sstEnabled: boolean; sstRate: number } | null;
  /** Null until a patient is picked. */
  patientIsMalaysian: boolean | null;
}

export interface TotalsPreview {
  totals: InvoiceTotals;
  /** False when SST can't be worked out here (settings unreadable or no patient yet). */
  taxKnown: boolean;
}

/** Live totals for the editor: rows that don't parse yet count as zero. */
export function previewTotals(drafts: LineDraft[], tax: TaxPreviewInput): TotalsPreview {
  const inputs = drafts
    .filter((d) => !isBlank(d))
    .map((d) => ({
      description: d.description.trim(),
      quantity: parseQuantity(d.quantity) ?? 0,
      unitPrice: parseMoney(d.unitPrice) ?? 0,
      taxable: d.taxable,
    }));
  const taxKnown = tax.branch !== null && tax.patientIsMalaysian !== null;
  const totals = computeTotals(inputs, {
    sstEnabled: taxKnown ? tax.branch!.sstEnabled : false,
    sstRate: tax.branch?.sstRate ?? 0,
    patientIsMalaysian: tax.patientIsMalaysian ?? true,
  });
  return { totals, taxKnown };
}

export interface AmountCheck {
  amount: number | null;
  error: string | null;
}

/** A payment amount: above zero and no more than the balance. */
export function checkPaymentAmount(text: string, balance: number): AmountCheck {
  const amount = parseMoney(text);
  if (amount === null || toSen(amount) === 0) return { amount: null, error: "Enter an amount above RM 0.00" };
  if (toSen(amount) > toSen(balance)) return { amount: null, error: `More than the balance of ${formatMYR(balance)}` };
  return { amount, error: null };
}

/** A refund amount: above zero and no more than what has been paid. */
export function checkRefundAmount(text: string, paid: number): AmountCheck {
  const amount = parseMoney(text);
  if (amount === null || toSen(amount) === 0) return { amount: null, error: "Enter an amount above RM 0.00" };
  if (toSen(amount) > toSen(paid)) return { amount: null, error: `More than the ${formatMYR(paid)} paid` };
  return { amount, error: null };
}

/** "131.60" — a balance as the amount field's starting text. */
export function amountInput(value: number): string {
  return value > 0 ? value.toFixed(2) : "";
}
