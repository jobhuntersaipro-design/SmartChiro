/**
 * Pure builders for LHDN MyInvois documents in UBL 2.1 JSON.
 *
 * Structure follows the official v1.0 samples (1.0-Invoice-Sample.json,
 * 1.0-Invoice-Consolidated-Sample.json, 1.0-Refund-Note-Sample.json from the
 * MyInvois SDK, copies under ./__fixtures__) and the field tables in
 * 04-document-types/invoice-v1-0 / credit-note-v1-0 / refund-note-v1-0. Every
 * element this file emits exists at the same path in those samples (a unit
 * test checks it). Credit, debit and refund notes share the Invoice root; only
 * the type code and the BillingReference differ.
 *
 * Nothing here reads the clock, the database or the environment: the same
 * input gives byte-identical JSON, so hashes are reproducible.
 */
import {
  CONSOLIDATED_CLASSIFICATION,
  DOCUMENT_TYPE,
  GENERAL_PUBLIC_NAME,
  GENERAL_TIN,
  NOT_AVAILABLE,
  NO_TAX_TAX_TYPE,
  SCHEME,
  SST_TAX_TYPE,
  UNIT_CODE,
  type DocumentTypeCode,
  type DocumentVersion,
  type PartyIdScheme,
} from "./codes";

// ─── Input model ───

export interface EInvoiceAddress {
  /** At least one line; "NA" alone for a consolidated buyer. */
  lines: string[];
  city: string;
  postcode: string | null;
  /** Malaysian state code ("14"), a foreign state name, or "17" (not applicable). */
  stateCode: string;
  /** ISO 3166-1 alpha-3, e.g. "MYS". */
  countryCode: string;
}

export interface EInvoiceParty {
  name: string;
  tin: string;
  idScheme: PartyIdScheme;
  idValue: string;
  /** SST registration no., or "NA". */
  sstNo: string;
  /** Tourism tax registration no., or "NA". */
  ttxNo: string;
  phone: string;
  email: string | null;
  address: EInvoiceAddress;
}

export interface EInvoiceSupplier extends EInvoiceParty {
  msicCode: string;
  businessActivity: string;
}

export interface EInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  /** quantity × unit price, before tax. */
  subtotal: number;
  taxType: string;
  /** Percent, e.g. 6; 0 when no tax. */
  taxRate: number;
  taxAmount: number;
  classification: string;
}

export interface EInvoiceDocumentInput {
  typeCode: DocumentTypeCode;
  version: DocumentVersion;
  /** cbc:ID — the supplier's document number (≤ 50 chars). */
  id: string;
  /** Issue instant; written as UTC date + time (the SDK requires the current UTC time). */
  issuedAt: Date;
  currency: "MYR";
  supplier: EInvoiceSupplier;
  buyer: EInvoiceParty;
  lines: EInvoiceLine[];
  /** For credit / debit / refund notes: the original e-invoice. */
  billingReference?: { id: string; uuid: string };
  /** Billing period, e.g. the month of a consolidated e-invoice. */
  period?: { start: string; end: string; description: string };
}

// ─── UBL JSON helpers ───

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Node = { [key: string]: Json };

export interface UblDocument {
  _D: string;
  _A: string;
  _B: string;
  Invoice: Node[];
  [key: string]: Json;
}

const NS = {
  _D: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  _A: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  _B: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
};

const v = (value: string | number | boolean, attrs: Record<string, string> = {}): Json[] => [{ _: value, ...attrs }];
const wrap = (node: Node): Json[] => [node];

/** Ringgit to 2 dp as a JSON number (sen arithmetic, so 0.1 + 0.2 stays 0.3). */
const sen = (value: number) => Math.round(Number((value * 100).toFixed(6)));
const ringgit = (s: number) => s / 100;
const money = (amountSen: number, currency: string): Json[] => v(ringgit(amountSen), { currencyID: currency });

const TAX_SCHEME: Json[] = wrap({ ID: v("OTH", { schemeID: "UN/ECE 5153", schemeAgencyID: "6" }) });

/** "2026-09-28" and "07:05:09Z" in UTC. */
export function utcDateTime(instant: Date): { date: string; time: string } {
  const iso = instant.toISOString();
  return { date: iso.slice(0, 10), time: `${iso.slice(11, 19)}Z` };
}

function address(a: EInvoiceAddress): Json[] {
  const node: Node = { CityName: v(a.city) };
  if (a.postcode) node.PostalZone = v(a.postcode);
  node.CountrySubentityCode = v(a.stateCode);
  node.AddressLine = a.lines.map((line) => ({ Line: v(line) }));
  node.Country = wrap({ IdentificationCode: v(a.countryCode, { listID: "ISO3166-1", listAgencyID: "6" }) });
  return wrap(node);
}

function identifications(p: EInvoiceParty): Json[] {
  return [
    { ID: v(p.tin, { schemeID: SCHEME.TIN }) },
    { ID: v(p.idValue, { schemeID: p.idScheme }) },
    { ID: v(p.sstNo, { schemeID: SCHEME.SST }) },
    { ID: v(p.ttxNo, { schemeID: SCHEME.TTX }) },
  ];
}

function contact(p: EInvoiceParty): Json[] {
  const node: Node = { Telephone: v(p.phone) };
  if (p.email) node.ElectronicMail = v(p.email);
  return wrap(node);
}

function supplierParty(s: EInvoiceSupplier): Json[] {
  return wrap({
    Party: wrap({
      IndustryClassificationCode: v(s.msicCode, { name: s.businessActivity }),
      PartyIdentification: identifications(s),
      PostalAddress: address(s.address),
      PartyLegalEntity: wrap({ RegistrationName: v(s.name) }),
      Contact: contact(s),
    }),
  });
}

function customerParty(b: EInvoiceParty): Json[] {
  return wrap({
    Party: wrap({
      PostalAddress: address(b.address),
      PartyLegalEntity: wrap({ RegistrationName: v(b.name) }),
      PartyIdentification: identifications(b),
      Contact: contact(b),
    }),
  });
}

interface TaxGroup {
  taxType: string;
  taxableSen: number;
  taxSen: number;
}

function taxSubtotal(taxableSen: number, taxSen: number, taxType: string, currency: string, percent?: number): Node {
  const node: Node = { TaxableAmount: money(taxableSen, currency), TaxAmount: money(taxSen, currency) };
  if (percent !== undefined) node.Percent = v(percent);
  node.TaxCategory = wrap({ ID: v(taxType), TaxScheme: TAX_SCHEME });
  return node;
}

function invoiceLine(line: EInvoiceLine, index: number, currency: string): Node {
  const subtotalSen = sen(line.subtotal);
  const taxSen = sen(line.taxAmount);
  return {
    ID: v(String(index + 1)),
    InvoicedQuantity: v(line.quantity, { unitCode: UNIT_CODE }),
    LineExtensionAmount: money(subtotalSen, currency),
    TaxTotal: wrap({
      TaxAmount: money(taxSen, currency),
      TaxSubtotal: wrap(taxSubtotal(subtotalSen, taxSen, line.taxType, currency, line.taxRate)),
    }),
    Item: wrap({
      CommodityClassification: wrap({ ItemClassificationCode: v(line.classification, { listID: "CLASS" }) }),
      Description: v(line.description.slice(0, 300)),
    }),
    Price: wrap({ PriceAmount: money(sen(line.unitPrice), currency) }),
    ItemPriceExtension: wrap({ Amount: money(subtotalSen, currency) }),
  };
}

/** Document-level sums: per tax type (in order of first use) and the monetary totals, in sen. */
export function documentTotals(lines: EInvoiceLine[]) {
  const groups: TaxGroup[] = [];
  let subtotalSen = 0;
  let taxSen = 0;
  for (const line of lines) {
    const lineSen = sen(line.subtotal);
    const lineTaxSen = sen(line.taxAmount);
    subtotalSen += lineSen;
    taxSen += lineTaxSen;
    let group = groups.find((g) => g.taxType === line.taxType);
    if (!group) {
      group = { taxType: line.taxType, taxableSen: 0, taxSen: 0 };
      groups.push(group);
    }
    group.taxableSen += lineSen;
    group.taxSen += lineTaxSen;
  }
  return { groups, subtotalSen, taxSen, totalSen: subtotalSen + taxSen };
}

/** Any document type (invoice 01, credit note 02, refund note 04) as UBL 2.1 JSON. */
export function buildDocument(input: EInvoiceDocumentInput): UblDocument {
  const { currency } = input;
  const { date, time } = utcDateTime(input.issuedAt);
  const totals = documentTotals(input.lines);

  const invoice: Node = {
    ID: v(input.id),
    IssueDate: v(date),
    IssueTime: v(time),
    InvoiceTypeCode: v(input.typeCode, { listVersionID: input.version }),
    DocumentCurrencyCode: v(currency),
    TaxCurrencyCode: v(currency),
  };
  if (input.period) {
    invoice.InvoicePeriod = wrap({
      StartDate: v(input.period.start),
      EndDate: v(input.period.end),
      Description: v(input.period.description),
    });
  }
  if (input.billingReference) {
    invoice.BillingReference = wrap({
      InvoiceDocumentReference: wrap({ ID: v(input.billingReference.id), UUID: v(input.billingReference.uuid) }),
    });
  }
  invoice.AccountingSupplierParty = supplierParty(input.supplier);
  invoice.AccountingCustomerParty = customerParty(input.buyer);
  invoice.TaxTotal = wrap({
    TaxAmount: money(totals.taxSen, currency),
    TaxSubtotal: totals.groups.map((g) => taxSubtotal(g.taxableSen, g.taxSen, g.taxType, currency)),
  });
  invoice.LegalMonetaryTotal = wrap({
    LineExtensionAmount: money(totals.subtotalSen, currency),
    TaxExclusiveAmount: money(totals.subtotalSen, currency),
    TaxInclusiveAmount: money(totals.totalSen, currency),
    PayableAmount: money(totals.totalSen, currency),
  });
  invoice.InvoiceLine = input.lines.map((line, i) => invoiceLine(line, i, currency));

  return { ...NS, Invoice: [invoice] };
}

// ─── Specific documents ───

export interface InvoiceDocumentArgs {
  version: DocumentVersion;
  number: string;
  issuedAt: Date;
  supplier: EInvoiceSupplier;
  buyer: EInvoiceParty;
  lines: EInvoiceLine[];
}

/** Invoice (type 01) for one patient invoice. */
export function buildInvoiceDocument(args: InvoiceDocumentArgs): UblDocument {
  return buildDocument({ typeCode: DOCUMENT_TYPE.INVOICE, currency: "MYR", id: args.number, ...args });
}

export interface NoteDocumentArgs extends InvoiceDocumentArgs {
  /** DOCUMENT_TYPE.REFUND_NOTE when money went back to the buyer, CREDIT_NOTE when it didn't. */
  typeCode: typeof DOCUMENT_TYPE.CREDIT_NOTE | typeof DOCUMENT_TYPE.REFUND_NOTE;
  original: { number: string; uuid: string };
}

/**
 * Credit note (02) or refund note (04) against a validated e-invoice. LHDN
 * defines the credit note as a reduction that "does not involve return of
 * monies to the Buyer" and the refund note as confirming a refund of the
 * buyer's payment (Submit Documents API), so a recorded refund payment is a
 * refund note.
 */
export function buildNoteDocument(args: NoteDocumentArgs): UblDocument {
  return buildDocument({
    typeCode: args.typeCode,
    version: args.version,
    id: args.number,
    issuedAt: args.issuedAt,
    currency: "MYR",
    supplier: args.supplier,
    buyer: args.buyer,
    lines: args.lines,
    billingReference: { id: args.original.number, uuid: args.original.uuid },
  });
}

/** Buyer block of a consolidated e-invoice (Specific Guideline §3.6.11 Table 3.5; official consolidated sample). */
export const GENERAL_PUBLIC_BUYER: EInvoiceParty = {
  name: GENERAL_PUBLIC_NAME,
  tin: GENERAL_TIN.PUBLIC,
  idScheme: "BRN",
  idValue: NOT_AVAILABLE,
  sstNo: NOT_AVAILABLE,
  ttxNo: NOT_AVAILABLE,
  phone: NOT_AVAILABLE,
  // The official consolidated sample sends "NA" here too.
  email: NOT_AVAILABLE,
  // AMBIGUOUS: the address table says "NA" in line 0 with only the state
  // (17 = not applicable) filled; the official sample sends empty strings for
  // the rest, which LHDN has started rejecting for other fields. City "NA" and
  // country MYS keep every mandatory element non-empty.
  address: { lines: [NOT_AVAILABLE], city: NOT_AVAILABLE, postcode: null, stateCode: "17", countryCode: "MYS" },
};

/** One sale rolled into a consolidated e-invoice (method (a): one entry per receipt/invoice). */
export interface ConsolidatedEntry {
  number: string;
  /** Taxable base, tax and rate for SST lines; the rest goes on a "no tax" line. */
  subtotal: number;
  taxableBase: number;
  taxAmount: number;
  taxRate: number;
}

/**
 * Lines for a consolidated e-invoice: each invoice becomes one line (two when
 * it mixes SST and non-SST items, so every line's tax matches its rate).
 * Classification is always 004.
 */
export function consolidatedLines(entries: ConsolidatedEntry[]): EInvoiceLine[] {
  const lines: EInvoiceLine[] = [];
  for (const e of entries) {
    const subtotalSen = sen(e.subtotal);
    const taxableSen = e.taxAmount > 0 ? Math.min(sen(e.taxableBase), subtotalSen) : 0;
    const otherSen = subtotalSen - taxableSen;
    if (taxableSen > 0) {
      lines.push({
        description: `Invoice ${e.number}${otherSen > 0 ? " (SST items)" : ""}`,
        quantity: 1,
        unitPrice: ringgit(taxableSen),
        subtotal: ringgit(taxableSen),
        taxType: SST_TAX_TYPE,
        taxRate: e.taxRate,
        taxAmount: e.taxAmount,
        classification: CONSOLIDATED_CLASSIFICATION,
      });
    }
    if (otherSen > 0 || taxableSen === 0) {
      lines.push({
        description: `Invoice ${e.number}${taxableSen > 0 ? " (non-SST items)" : ""}`,
        quantity: 1,
        unitPrice: ringgit(otherSen),
        subtotal: ringgit(otherSen),
        taxType: NO_TAX_TAX_TYPE,
        taxRate: 0,
        taxAmount: 0,
        classification: CONSOLIDATED_CLASSIFICATION,
      });
    }
  }
  return lines;
}

export interface ConsolidatedDocumentArgs {
  version: DocumentVersion;
  number: string;
  issuedAt: Date;
  supplier: EInvoiceSupplier;
  entries: ConsolidatedEntry[];
  /** First and last day of the month, "YYYY-MM-DD". */
  period: { start: string; end: string };
}

/** Monthly consolidated e-invoice (type 01) to the General Public for B2C sales not issued individually. */
export function buildConsolidatedDocument(args: ConsolidatedDocumentArgs): UblDocument {
  return buildDocument({
    typeCode: DOCUMENT_TYPE.INVOICE,
    version: args.version,
    id: args.number,
    issuedAt: args.issuedAt,
    currency: "MYR",
    supplier: args.supplier,
    buyer: GENERAL_PUBLIC_BUYER,
    lines: consolidatedLines(args.entries),
    period: { ...args.period, description: "Monthly" },
  });
}
