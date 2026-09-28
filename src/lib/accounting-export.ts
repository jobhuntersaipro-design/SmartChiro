import type { PaymentMethod } from "@prisma/client";
import { PAYMENT_METHOD_LABEL, effectiveInvoiceStatus, toSen, type AnyInvoiceStatus, type InvoiceLineItem } from "@/lib/invoices";
import { csvDate, toCsv, type CsvCell, type CsvRaw } from "@/lib/reports/csv";

/**
 * Accounting exports (Phase 8.3), pure and client-safe: invoices and
 * payments listings, a Xero sales-invoice import and a generic double-entry
 * journal for AutoCount / SQL Account. Money is worked in sen so every
 * journal entry balances exactly; CSVs are RFC 4180 with the formula guard
 * from src/lib/reports/csv.ts. Dates are clinic days as dd/mm/yyyy.
 */

// ─── Account codes ───

export interface AccountCodes {
  sales: string;
  sst: string;
  receivable: string;
  cash: string;
  bank: string;
  card: string;
  ewallet: string;
  panel: string;
}

export type AccountCodeKey = keyof AccountCodes;

/** Branch column, label and default for each code (a small SME chart of accounts). */
export const ACCOUNT_CODE_FIELDS: { key: AccountCodeKey; column: BranchAccountColumn; label: string; fallback: string }[] = [
  { key: "sales", column: "acctSales", label: "Sales", fallback: "4000" },
  { key: "sst", column: "acctSst", label: "SST payable", fallback: "2200" },
  { key: "receivable", column: "acctReceivable", label: "Accounts receivable", fallback: "1200" },
  { key: "cash", column: "acctCash", label: "Cash", fallback: "1000" },
  { key: "bank", column: "acctBank", label: "Bank (transfer, FPX, DuitNow)", fallback: "1010" },
  { key: "card", column: "acctCard", label: "Card clearing", fallback: "1020" },
  { key: "ewallet", column: "acctEwallet", label: "e-Wallet clearing", fallback: "1030" },
  { key: "panel", column: "acctPanel", label: "Panel / TPA receivable", fallback: "1210" },
];

export type BranchAccountColumn =
  | "acctSales"
  | "acctSst"
  | "acctReceivable"
  | "acctCash"
  | "acctBank"
  | "acctCard"
  | "acctEwallet"
  | "acctPanel";

export type BranchAccountColumns = Record<BranchAccountColumn, string | null>;

/** Prisma `select` for a branch's account codes. */
export const ACCOUNT_CODE_SELECT = {
  acctSales: true,
  acctSst: true,
  acctReceivable: true,
  acctCash: true,
  acctBank: true,
  acctCard: true,
  acctEwallet: true,
  acctPanel: true,
} as const satisfies Record<BranchAccountColumn, true>;

export const DEFAULT_ACCOUNT_CODES: AccountCodes = Object.fromEntries(
  ACCOUNT_CODE_FIELDS.map((f) => [f.key, f.fallback]),
) as unknown as AccountCodes;

/** The codes a branch uses: its own where set, else the defaults. */
export function accountCodesOf(branch: Partial<BranchAccountColumns>): AccountCodes {
  return Object.fromEntries(
    ACCOUNT_CODE_FIELDS.map((f) => [f.key, branch[f.column]?.trim() || f.fallback]),
  ) as unknown as AccountCodes;
}

/** The branch's own codes by key (null = uses the default). */
export function accountCodesJson(branch: Partial<BranchAccountColumns>): Record<AccountCodeKey, string | null> {
  return Object.fromEntries(ACCOUNT_CODE_FIELDS.map((f) => [f.key, branch[f.column] ?? null])) as Record<AccountCodeKey, string | null>;
}

/** A chart-of-account code: starts with a letter or digit, then letters, digits, "." "-" "/" (max 20). */
export const ACCOUNT_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9./-]{0,19}$/;

/** Where money received by each method is debited. */
export function paymentAccountKey(method: PaymentMethod): AccountCodeKey {
  switch (method) {
    case "CASH":
      return "cash";
    case "CARD":
      return "card";
    case "EWALLET":
      return "ewallet";
    case "PANEL":
      return "panel";
    default:
      // BANK_TRANSFER, FPX and DuitNow QR settle into the bank account.
      return "bank";
  }
}

// ─── Rows ───

export interface ExportInvoice {
  invoiceNumber: string;
  issuedAt: Date;
  dueDate: Date | null;
  status: AnyInvoiceStatus;
  branchId: string;
  branchName: string;
  patientName: string;
  patientEmail: string | null;
  currency: string;
  /** Grand total (MYR). */
  amount: number;
  taxAmount: number | null;
  taxLabel: string | null;
  amountPaid: number;
  lineItems: InvoiceLineItem[];
}

export interface ExportPayment {
  receiptNumber: string;
  receivedAt: Date;
  branchId: string;
  branchName: string;
  invoiceNumber: string;
  patientName: string;
  method: PaymentMethod;
  reference: string | null;
  /** Negative for a refund. */
  amount: number;
  refundReason: string | null;
}

const senCell = (sen: number): CsvRaw => ({ raw: (sen / 100).toFixed(2) });

/** Invoices that count in the books: issued (not drafts) and not cancelled. */
export const isPostedInvoice = (inv: Pick<ExportInvoice, "status">) => inv.status !== "DRAFT" && inv.status !== "CANCELLED";

function invoiceSplit(inv: ExportInvoice): { totalSen: number; taxSen: number; salesSen: number } {
  const totalSen = toSen(inv.amount);
  const taxSen = toSen(inv.taxAmount ?? 0);
  return { totalSen, taxSen, salesSen: totalSen - taxSen };
}

// ─── Invoices / payments listings ───

export const INVOICE_CSV_HEADERS = [
  "Invoice no.",
  "Issue date",
  "Due date",
  "Branch",
  "Patient",
  "Status",
  "Currency",
  "Subtotal",
  "Tax",
  "Tax type",
  "Total",
  "Paid",
  "Balance",
];

export function invoicesCsv(invoices: ExportInvoice[], now: Date = new Date()): string {
  const rows: CsvCell[][] = invoices.map((inv) => {
    const { totalSen, taxSen, salesSen } = invoiceSplit(inv);
    const paidSen = toSen(inv.amountPaid);
    const status = effectiveInvoiceStatus(inv.status, inv.dueDate, now);
    return [
      inv.invoiceNumber,
      csvDate(inv.issuedAt),
      csvDate(inv.dueDate),
      inv.branchName,
      inv.patientName,
      status,
      inv.currency,
      senCell(salesSen),
      senCell(taxSen),
      inv.taxLabel ?? "",
      senCell(totalSen),
      senCell(paidSen),
      senCell(status === "CANCELLED" ? 0 : totalSen - paidSen),
    ];
  });
  return toCsv(INVOICE_CSV_HEADERS, rows);
}

export const PAYMENT_CSV_HEADERS = [
  "Receipt no.",
  "Date",
  "Branch",
  "Invoice no.",
  "Patient",
  "Type",
  "Method",
  "Reference",
  "Amount",
  "Refund reason",
];

export function paymentsCsv(payments: ExportPayment[]): string {
  const rows: CsvCell[][] = payments.map((p) => [
    p.receiptNumber,
    csvDate(p.receivedAt),
    p.branchName,
    p.invoiceNumber,
    p.patientName,
    p.amount < 0 ? "Refund" : "Payment",
    PAYMENT_METHOD_LABEL[p.method] ?? p.method,
    p.reference ?? "",
    senCell(toSen(p.amount)),
    p.refundReason ?? "",
  ]);
  return toCsv(PAYMENT_CSV_HEADERS, rows);
}

// ─── Xero ───

export const XERO_HEADERS = [
  "*ContactName",
  "EmailAddress",
  "*InvoiceNumber",
  "Reference",
  "*InvoiceDate",
  "*DueDate",
  "Description",
  "*Quantity",
  "*UnitAmount",
  "*AccountCode",
  "*TaxType",
  "Currency",
];

export const XERO_TAX_ON_SALES = "Tax on Sales";
export const XERO_NO_TAX = "No Tax";

/**
 * Xero "Import sales invoices" CSV: one row per line item, amounts tax
 * exclusive. A line is "Tax on Sales" when the invoice charged SST and the
 * line is taxable, else "No Tax". Drafts and cancelled invoices are left out.
 */
export function xeroInvoicesCsv(invoices: ExportInvoice[], codes: (branchId: string) => AccountCodes): string {
  const rows: CsvCell[][] = [];
  for (const inv of invoices.filter(isPostedInvoice)) {
    const { salesSen, taxSen } = invoiceSplit(inv);
    const taxed = taxSen > 0;
    const head = [inv.patientName, inv.patientEmail ?? "", inv.invoiceNumber, inv.branchName, csvDate(inv.issuedAt), csvDate(inv.dueDate ?? inv.issuedAt)];
    const lines = inv.lineItems.length > 0 ? inv.lineItems : [{ description: "Invoice total", quantity: 1, unitPrice: salesSen / 100, total: salesSen / 100 }];
    for (const line of lines) {
      rows.push([
        ...head,
        line.description || "Item",
        line.quantity,
        senCell(toSen(line.unitPrice)),
        codes(inv.branchId).sales,
        taxed && line.taxable !== false ? XERO_TAX_ON_SALES : XERO_NO_TAX,
        inv.currency || "MYR",
      ]);
    }
  }
  return toCsv(XERO_HEADERS, rows);
}

// ─── Journal ───

export interface JournalLine {
  date: Date;
  account: string;
  debitSen: number;
  creditSen: number;
  reference: string;
  description: string;
}

export const JOURNAL_HEADERS = ["Date", "Account", "Debit", "Credit", "Reference", "Description"];

/**
 * Double-entry lines. An invoice: Dr receivable (total) / Cr sales (total
 * less SST) / Cr SST payable. A payment: Dr the method's account / Cr
 * receivable. A refund is the payment reversed. Every entry balances.
 */
export function journalLines(invoices: ExportInvoice[], payments: ExportPayment[], codes: (branchId: string) => AccountCodes): JournalLine[] {
  const out: JournalLine[] = [];
  for (const inv of invoices.filter(isPostedInvoice)) {
    const c = codes(inv.branchId);
    const { totalSen, taxSen, salesSen } = invoiceSplit(inv);
    const base = { date: inv.issuedAt, reference: inv.invoiceNumber, description: `Invoice ${inv.invoiceNumber} — ${inv.patientName}` };
    out.push({ ...base, account: c.receivable, debitSen: totalSen, creditSen: 0 });
    out.push({ ...base, account: c.sales, debitSen: 0, creditSen: salesSen });
    if (taxSen !== 0) out.push({ ...base, account: c.sst, debitSen: 0, creditSen: taxSen, description: `${inv.taxLabel ?? "SST"} on ${inv.invoiceNumber}` });
  }
  for (const p of payments) {
    const c = codes(p.branchId);
    const sen = toSen(p.amount);
    const money = c[paymentAccountKey(p.method)];
    const refund = sen < 0;
    const abs = Math.abs(sen);
    const description = `${refund ? "Refund" : "Payment"} ${PAYMENT_METHOD_LABEL[p.method] ?? p.method} for ${p.invoiceNumber} — ${p.patientName}`;
    const base = { date: p.receivedAt, reference: p.receiptNumber, description };
    out.push({ ...base, account: refund ? c.receivable : money, debitSen: abs, creditSen: 0 });
    out.push({ ...base, account: refund ? money : c.receivable, debitSen: 0, creditSen: abs });
  }
  // Stable order: by date, entries kept together.
  return out
    .map((line, i) => ({ line, i }))
    .sort((a, b) => a.line.date.getTime() - b.line.date.getTime() || a.i - b.i)
    .map(({ line }) => line);
}

export function journalTotals(lines: JournalLine[]): { debitSen: number; creditSen: number } {
  return lines.reduce((t, l) => ({ debitSen: t.debitSen + l.debitSen, creditSen: t.creditSen + l.creditSen }), { debitSen: 0, creditSen: 0 });
}

export function journalCsv(lines: JournalLine[]): string {
  return toCsv(
    JOURNAL_HEADERS,
    lines.map((l) => [csvDate(l.date), l.account, senCell(l.debitSen), senCell(l.creditSen), l.reference, l.description]),
  );
}

// ─── Downloads ───

export type AccountingExportKind = "invoices" | "payments" | "xero-invoices" | "journal";

export const ACCOUNTING_EXPORTS: { kind: AccountingExportKind; label: string; hint: string }[] = [
  { kind: "invoices", label: "Invoices", hint: "Every issued invoice with tax, paid and balance" },
  { kind: "payments", label: "Payments", hint: "Payments and refunds received" },
  { kind: "xero-invoices", label: "Xero sales invoices", hint: "Xero → Sales → Import (one row per line)" },
  { kind: "journal", label: "Journal", hint: "Debit / credit lines for AutoCount or SQL Account" },
];
