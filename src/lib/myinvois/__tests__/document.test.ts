import { describe, expect, it } from "vitest";
import {
  GENERAL_PUBLIC_BUYER,
  buildConsolidatedDocument,
  buildInvoiceDocument,
  buildNoteDocument,
  consolidatedLines,
  documentTotals,
  utcDateTime,
} from "../document";
import { buyerFromPatient, linesFromInvoice, refundLines, supplierFromBranch, taxableBase } from "../source";
import { encodeDocument } from "../hash";
import { BRANCH, FOREIGN_PATIENT, ISSUED_AT, LOCAL_PATIENT, NO_TAX_INVOICE, SST_INVOICE } from "./sample-inputs";
import officialInvoice from "../__fixtures__/lhdn-1.0-Invoice-Sample.json";
import officialConsolidated from "../__fixtures__/lhdn-1.0-Invoice-Consolidated-Sample.json";
import officialRefund from "../__fixtures__/lhdn-1.0-Refund-Note-Sample.json";
import officialCredit from "../__fixtures__/lhdn-1.0-Credit-Note-Sample.json";
import expectedInvoice from "../__fixtures__/smartchiro-invoice-sst-1.0.json";
import expectedConsolidated from "../__fixtures__/smartchiro-consolidated-1.0.json";
import expectedRefund from "../__fixtures__/smartchiro-refund-note-1.0.json";

const supplier = () => supplierFromBranch(BRANCH).value!;
const entry = (f: typeof SST_INVOICE) => ({
  number: f.invoiceNumber,
  subtotal: f.subtotal,
  taxableBase: taxableBase(f),
  taxAmount: f.taxAmount,
  taxRate: f.taxRate ?? 0,
});

function sstInvoiceDoc() {
  return buildInvoiceDocument({
    version: "1.0",
    number: SST_INVOICE.invoiceNumber,
    issuedAt: ISSUED_AT,
    supplier: supplier(),
    buyer: buyerFromPatient(FOREIGN_PATIENT).value!,
    lines: linesFromInvoice(SST_INVOICE).value!,
  });
}

/** Every key path in a UBL JSON document, arrays collapsed to []. */
function paths(value: unknown, prefix = "", out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => paths(v, `${prefix}[]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) paths(v, `${prefix}.${k}`, out);
  } else out.add(prefix);
  return out;
}

const OFFICIAL_PATHS = new Set([...paths(officialInvoice), ...paths(officialConsolidated), ...paths(officialRefund), ...paths(officialCredit)]);

describe("MyInvois UBL JSON builders", () => {
  it("builds the SST invoice exactly as the reviewed fixture", () => {
    expect(sstInvoiceDoc()).toEqual(expectedInvoice);
  });

  it("uses only elements and attributes that appear in the official LHDN v1.0 samples", () => {
    const docs = [
      sstInvoiceDoc(),
      buildConsolidatedDocument({
        version: "1.0",
        number: "CONS-SK-202608-01",
        issuedAt: ISSUED_AT,
        supplier: supplier(),
        entries: [entry(SST_INVOICE)],
        period: { start: "2026-08-01", end: "2026-08-31" },
      }),
    ];
    for (const doc of docs) {
      const unknown = [...paths(doc)].filter((p) => !OFFICIAL_PATHS.has(p));
      expect(unknown).toEqual([]);
    }
  });

  it("is deterministic: same input, same bytes and hash", () => {
    const a = encodeDocument(sstInvoiceDoc());
    const b = encodeDocument(sstInvoiceDoc());
    expect(a.json).toBe(b.json);
    expect(a.documentHash).toBe(b.documentHash);
  });

  it("writes the issue date and time in UTC", () => {
    expect(utcDateTime(new Date("2026-09-30T23:30:00+08:00"))).toEqual({ date: "2026-09-30", time: "15:30:00Z" });
    const doc = sstInvoiceDoc().Invoice[0];
    expect(doc.IssueDate).toEqual([{ _: "2026-09-28" }]);
    expect(doc.IssueTime).toEqual([{ _: "07:05:09Z" }]);
  });

  it("maps 6% SST for a non-citizen to Service Tax (02) and the rest to Not Applicable (06)", () => {
    const lines = linesFromInvoice(SST_INVOICE).value!;
    expect(lines.map((l) => [l.taxType, l.taxRate, l.taxAmount])).toEqual([
      ["02", 6, 9],
      ["06", 0, 0],
    ]);
    const totals = documentTotals(lines);
    expect(totals).toMatchObject({ subtotalSen: 23000, taxSen: 900, totalSen: 23900 });
    expect(totals.groups).toEqual([
      { taxType: "02", taxableSen: 15000, taxSen: 900 },
      { taxType: "06", taxableSen: 8000, taxSen: 0 },
    ]);
  });

  it("sends a Malaysian patient's invoice with no tax as 06 at 0%", () => {
    const lines = linesFromInvoice(NO_TAX_INVOICE).value!;
    expect(lines.every((l) => l.taxType === "06" && l.taxAmount === 0 && l.taxRate === 0)).toBe(true);
    const doc = buildInvoiceDocument({
      version: "1.0",
      number: NO_TAX_INVOICE.invoiceNumber,
      issuedAt: ISSUED_AT,
      supplier: supplier(),
      buyer: buyerFromPatient(LOCAL_PATIENT).value!,
      lines,
    }).Invoice[0];
    expect(doc.LegalMonetaryTotal).toEqual([
      {
        LineExtensionAmount: [{ _: 230, currencyID: "MYR" }],
        TaxExclusiveAmount: [{ _: 230, currencyID: "MYR" }],
        TaxInclusiveAmount: [{ _: 230, currencyID: "MYR" }],
        PayableAmount: [{ _: 230, currencyID: "MYR" }],
      },
    ]);
    expect(doc.TaxTotal).toEqual([
      {
        TaxAmount: [{ _: 0, currencyID: "MYR" }],
        TaxSubtotal: [
          {
            TaxableAmount: [{ _: 230, currencyID: "MYR" }],
            TaxAmount: [{ _: 0, currencyID: "MYR" }],
            TaxCategory: [{ ID: [{ _: "06" }], TaxScheme: [{ ID: [{ _: "OTH", schemeID: "UN/ECE 5153", schemeAgencyID: "6" }] }] }],
          },
        ],
      },
    ]);
  });

  it("spreads invoice-level SST over several taxable lines so the parts add up", () => {
    const inv = {
      ...SST_INVOICE,
      lineItems: [
        { description: "A", quantity: 1, unitPrice: 33.33, total: 33.33 },
        { description: "B", quantity: 1, unitPrice: 33.33, total: 33.33 },
        { description: "C", quantity: 1, unitPrice: 33.34, total: 33.34 },
      ],
      subtotal: 100,
      taxAmount: 6,
      total: 106,
    };
    const lines = linesFromInvoice(inv).value!;
    expect(lines.map((l) => l.taxAmount)).toEqual([2, 2, 2]);
    expect(documentTotals(lines).taxSen).toBe(600);
  });

  it("builds the refund note (04) with a billing reference to the original e-invoice", () => {
    const doc = buildNoteDocument({
      typeCode: "04",
      version: "1.0",
      number: "RCP-SK-2026-00031",
      issuedAt: ISSUED_AT,
      supplier: supplier(),
      buyer: buyerFromPatient(FOREIGN_PATIENT).value!,
      lines: refundLines(SST_INVOICE, { receiptNumber: "RCP-SK-2026-00031", amount: -119.5, refundReason: "Pillow returned" }).value!,
      original: { number: SST_INVOICE.invoiceNumber, uuid: "F9D425P6DS7D8IU0NSY5N1TK10" },
    });
    expect(doc).toEqual(expectedRefund);
    expect([...paths(doc)].filter((p) => !OFFICIAL_PATHS.has(p))).toEqual([]);
  });

  it("can build a credit note (02) too", () => {
    const doc = buildNoteDocument({
      typeCode: "02",
      version: "1.0",
      number: "CN-1",
      issuedAt: ISSUED_AT,
      supplier: supplier(),
      buyer: buyerFromPatient(LOCAL_PATIENT).value!,
      lines: refundLines(NO_TAX_INVOICE, { receiptNumber: "CN-1", amount: -30, refundReason: null }).value!,
      original: { number: NO_TAX_INVOICE.invoiceNumber, uuid: "UUID1" },
    });
    expect(doc.Invoice[0].InvoiceTypeCode).toEqual([{ _: "02", listVersionID: "1.0" }]);
    expect(documentTotals(refundLines(NO_TAX_INVOICE, { receiptNumber: "CN-1", amount: -30, refundReason: null }).value!).totalSen).toBe(3000);
  });

  describe("consolidated e-invoice", () => {
    it("matches the reviewed fixture (General Public buyer, 004, monthly period)", () => {
      const doc = buildConsolidatedDocument({
        version: "1.0",
        number: "CONS-SK-202608-01",
        issuedAt: ISSUED_AT,
        supplier: supplier(),
        period: { start: "2026-08-01", end: "2026-08-31" },
        entries: [entry(SST_INVOICE), entry(NO_TAX_INVOICE)],
      });
      expect(doc).toEqual(expectedConsolidated);
    });

    it("aggregates invoices into lines whose totals add up, splitting mixed SST invoices", () => {
      const lines = consolidatedLines([entry(SST_INVOICE), entry(NO_TAX_INVOICE)]);
      expect(lines).toHaveLength(3);
      expect(lines.every((l) => l.classification === "004")).toBe(true);
      const totals = documentTotals(lines);
      expect(totals).toMatchObject({ subtotalSen: 46000, taxSen: 900, totalSen: 46900 });
      expect(lines[0]).toMatchObject({ taxType: "02", subtotal: 150, taxAmount: 9, taxRate: 6 });
    });

    it("uses the general public TIN with NA identifiers", () => {
      expect(GENERAL_PUBLIC_BUYER).toMatchObject({ name: "General Public", tin: "EI00000000010", idScheme: "BRN", idValue: "NA", sstNo: "NA" });
      expect(GENERAL_PUBLIC_BUYER.address.stateCode).toBe("17");
    });
  });
});
