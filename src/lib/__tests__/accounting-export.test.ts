import { describe, it, expect } from "vitest";
import { clinicInstant } from "@/lib/clinic-time";
import {
  DEFAULT_ACCOUNT_CODES,
  INVOICE_CSV_HEADERS,
  JOURNAL_HEADERS,
  XERO_HEADERS,
  accountCodesOf,
  invoicesCsv,
  journalCsv,
  journalLines,
  journalTotals,
  paymentAccountKey,
  paymentsCsv,
  xeroInvoicesCsv,
  type ExportInvoice,
  type ExportPayment,
} from "@/lib/accounting-export";

const parse = (csv: string) => csv.trimEnd().split("\r\n").map((line) => line.split(","));

const inv = (i: Partial<ExportInvoice>): ExportInvoice => ({
  invoiceNumber: "INV-1",
  issuedAt: clinicInstant(2026, 9, 3, 10),
  dueDate: clinicInstant(2026, 9, 17, 10),
  status: "SENT",
  branchId: "b1",
  branchName: "KLCC",
  patientName: "Siti Aminah",
  patientEmail: "siti@example.com",
  currency: "MYR",
  amount: 100,
  taxAmount: null,
  taxLabel: null,
  amountPaid: 0,
  lineItems: [{ description: "Adjustment", quantity: 1, unitPrice: 100, total: 100 }],
  ...i,
});

const pay = (p: Partial<ExportPayment>): ExportPayment => ({
  receiptNumber: "RCP-1",
  receivedAt: clinicInstant(2026, 9, 4, 9),
  branchId: "b1",
  branchName: "KLCC",
  invoiceNumber: "INV-1",
  patientName: "Siti Aminah",
  method: "CASH",
  reference: null,
  amount: 100,
  refundReason: null,
  ...p,
});

// Foreign patient: RM 200 taxable + RM 50 non-taxable, 6% SST on the taxable part.
const SST_INVOICE = inv({
  invoiceNumber: "INV-2",
  patientName: "John Smith",
  amount: 262,
  taxAmount: 12,
  taxLabel: "SST 6%",
  amountPaid: 262,
  status: "PAID",
  lineItems: [
    { description: "Spinal decompression", quantity: 2, unitPrice: 100, total: 200, taxable: true },
    { description: "Brace", quantity: 1, unitPrice: 50, total: 50, taxable: false },
  ],
});

const codes = () => DEFAULT_ACCOUNT_CODES;

describe("account codes", () => {
  it("falls back to the defaults per field", () => {
    expect(DEFAULT_ACCOUNT_CODES).toEqual({
      sales: "4000", sst: "2200", receivable: "1200", cash: "1000", bank: "1010", card: "1020", ewallet: "1030", panel: "1210",
    });
    expect(accountCodesOf({ acctSales: "500-000", acctCash: "  " }).sales).toBe("500-000");
    expect(accountCodesOf({ acctSales: "500-000", acctCash: "  " }).cash).toBe("1000");
  });

  it("maps payment methods to accounts", () => {
    expect(paymentAccountKey("CASH")).toBe("cash");
    expect(paymentAccountKey("CARD")).toBe("card");
    expect(paymentAccountKey("EWALLET")).toBe("ewallet");
    expect(paymentAccountKey("PANEL")).toBe("panel");
    expect(paymentAccountKey("FPX")).toBe("bank");
    expect(paymentAccountKey("DUITNOW_QR")).toBe("bank");
    expect(paymentAccountKey("BANK_TRANSFER")).toBe("bank");
  });
});

describe("invoices / payments CSV", () => {
  it("lists invoices with subtotal, tax, paid and balance", () => {
    const rows = parse(invoicesCsv([inv({ amountPaid: 40 }), SST_INVOICE], clinicInstant(2026, 9, 10)));
    expect(rows[0]).toEqual(INVOICE_CSV_HEADERS);
    expect(rows[1]).toEqual(["INV-1", "03/09/2026", "17/09/2026", "KLCC", "Siti Aminah", "SENT", "MYR", "100.00", "0.00", "", "100.00", "40.00", "60.00"]);
    expect(rows[2]).toEqual(["INV-2", "03/09/2026", "17/09/2026", "KLCC", "John Smith", "PAID", "MYR", "250.00", "12.00", "SST 6%", "262.00", "262.00", "0.00"]);
  });

  it("marks refunds and guards formulas", () => {
    const csv = paymentsCsv([pay({}), pay({ receiptNumber: "RCP-2", amount: -20, refundReason: "=cmd()", method: "CARD" })]);
    const rows = parse(csv);
    expect(rows[1]).toEqual(["RCP-1", "04/09/2026", "KLCC", "INV-1", "Siti Aminah", "Payment", "Cash", "", "100.00", ""]);
    expect(rows[2]).toEqual(["RCP-2", "04/09/2026", "KLCC", "INV-1", "Siti Aminah", "Refund", "Card", "", "-20.00", "'=cmd()"]);
  });
});

describe("Xero sales invoices", () => {
  it("one row per line, dd/mm/yyyy, tax type per taxable line", () => {
    const rows = parse(xeroInvoicesCsv([inv({}), SST_INVOICE], codes));
    expect(rows[0]).toEqual(XERO_HEADERS);
    expect(rows[1]).toEqual(["Siti Aminah", "siti@example.com", "INV-1", "KLCC", "03/09/2026", "17/09/2026", "Adjustment", "1", "100.00", "4000", "No Tax", "MYR"]);
    expect(rows[2]).toEqual(["John Smith", "siti@example.com", "INV-2", "KLCC", "03/09/2026", "17/09/2026", "Spinal decompression", "2", "100.00", "4000", "Tax on Sales", "MYR"]);
    expect(rows[3][6]).toBe("Brace");
    expect(rows[3][10]).toBe("No Tax");
    expect(rows).toHaveLength(4);
  });

  it("leaves out drafts and cancelled invoices, due date defaults to the issue date", () => {
    const rows = parse(
      xeroInvoicesCsv([inv({ status: "CANCELLED" }), inv({ status: "DRAFT" }), inv({ invoiceNumber: "INV-9", dueDate: null, lineItems: [] })], codes),
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["Siti Aminah", "siti@example.com", "INV-9", "KLCC", "03/09/2026", "03/09/2026", "Invoice total", "1", "100.00", "4000", "No Tax", "MYR"]);
  });
});

describe("journal", () => {
  const lines = journalLines(
    [inv({}), SST_INVOICE, inv({ invoiceNumber: "INV-X", status: "CANCELLED", amount: 999 })],
    [
      pay({}),
      pay({ receiptNumber: "RCP-2", invoiceNumber: "INV-2", amount: 262, method: "FPX", receivedAt: clinicInstant(2026, 9, 5) }),
      pay({ receiptNumber: "RCP-3", invoiceNumber: "INV-2", amount: -12.35, method: "EWALLET", receivedAt: clinicInstant(2026, 9, 6) }),
    ],
    codes,
  );

  it("posts invoices, payments and refunds as balanced entries", () => {
    const totals = journalTotals(lines);
    expect(totals.debitSen).toBe(totals.creditSen);
    // Each reference balances on its own too.
    const byRef = new Map<string, number>();
    for (const l of lines) byRef.set(l.reference, (byRef.get(l.reference) ?? 0) + l.debitSen - l.creditSen);
    expect([...byRef.values()].every((v) => v === 0)).toBe(true);
    expect(lines.some((l) => l.reference === "INV-X")).toBe(false);
  });

  it("uses the right accounts", () => {
    const pick = (ref: string) => lines.filter((l) => l.reference === ref).map((l) => [l.account, l.debitSen, l.creditSen]);
    expect(pick("INV-2")).toEqual([["1200", 26200, 0], ["4000", 0, 25000], ["2200", 0, 1200]]);
    expect(pick("RCP-1")).toEqual([["1000", 10000, 0], ["1200", 0, 10000]]);
    expect(pick("RCP-2")).toEqual([["1010", 26200, 0], ["1200", 0, 26200]]);
    // Refund reversed: Dr receivable / Cr e-wallet clearing.
    expect(pick("RCP-3")).toEqual([["1200", 1235, 0], ["1030", 0, 1235]]);
  });

  it("writes the CSV", () => {
    const rows = parse(journalCsv(lines));
    expect(rows[0]).toEqual(JOURNAL_HEADERS);
    expect(rows[1].slice(0, 5)).toEqual(["03/09/2026", "1200", "100.00", "0.00", "INV-1"]);
    const debit = rows.slice(1).reduce((s, r) => s + Math.round(Number(r[2]) * 100), 0);
    const credit = rows.slice(1).reduce((s, r) => s + Math.round(Number(r[3]) * 100), 0);
    expect(debit).toBe(credit);
  });
});
