/**
 * Maps SmartChiro records (branch, patient, invoice, refund) to the MyInvois
 * document model, collecting field-level problems instead of throwing. Pure:
 * callers pass plain objects (Prisma rows fit).
 */
import { fromSen, isMalaysianPatient, isValidMyKad, toSen, type InvoiceLineItem } from "@/lib/invoices";
import {
  DEFAULT_CLASSIFICATION,
  GENERAL_TIN,
  NOT_AVAILABLE,
  NO_TAX_TAX_TYPE,
  SST_TAX_TYPE,
  countryCode,
  e164Phone,
  malaysianStateCode,
} from "./codes";
import type { EInvoiceAddress, EInvoiceLine, EInvoiceParty, EInvoiceSupplier } from "./document";

export interface FieldError {
  /** Where to fix it, e.g. "branch.msicCode", "patient.phone", "invoice.status". */
  field: string;
  message: string;
}

export interface Mapped<T> {
  value: T | null;
  errors: FieldError[];
  warnings: FieldError[];
}

export interface BranchEInvoiceFields {
  name: string;
  legalName: string | null;
  ssmRegNo: string | null;
  tin: string | null;
  sstRegNo: string | null;
  msicCode: string | null;
  businessActivity: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
}

export interface PatientEInvoiceFields {
  firstName: string;
  lastName: string;
  icNumber: string | null;
  passportNumber?: string | null;
  nationality: string | null;
  phone: string | null;
  email: string | null;
  address?: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

export interface InvoiceEInvoiceFields {
  invoiceNumber: string;
  status: string;
  currency: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxRate: number | null;
  taxAmount: number;
  total: number;
}

const clean = (value: string | null | undefined) => (value ?? "").trim();

/** TIN: letters + digits, no spaces (e.g. C2584563200, IG12345678901). */
export const TIN_PATTERN = /^[A-Z]{1,2}\d{8,12}$/;

/**
 * SSM number as LHDN wants it: the 12-digit new format. "202401012345
 * (1234567-A)" → "202401012345". Old-format-only numbers pass through as
 * typed (LHDN may reject them — flagged as a warning).
 */
export function normaliseBrn(value: string | null | undefined): string {
  const raw = clean(value);
  const modern = raw.match(/\b(\d{12})\b/);
  return modern ? modern[1] : raw.replace(/\s+/g, "");
}

function malaysianAddress(
  prefix: "branch" | "patient",
  lines: (string | null | undefined)[],
  city: string | null | undefined,
  state: string | null | undefined,
  postcode: string | null | undefined,
  country: string | null | undefined,
  errors: FieldError[],
): EInvoiceAddress | null {
  const addressLines = lines.map(clean).filter(Boolean).map((l) => l.slice(0, 150));
  const who = prefix === "branch" ? "the branch" : "the patient";
  if (addressLines.length === 0) errors.push({ field: `${prefix}.address`, message: `Add ${who}'s street address.` });
  if (!clean(city)) errors.push({ field: `${prefix}.city`, message: `Add ${who}'s city.` });
  const iso3 = countryCode(country);
  if (!iso3) {
    errors.push({ field: `${prefix}.country`, message: `Country "${clean(country)}" isn't in LHDN's country list.` });
    return null;
  }
  let stateCode: string | null;
  if (iso3 === "MYS") {
    stateCode = malaysianStateCode(state, city, postcode);
    if (!stateCode) {
      errors.push({
        field: `${prefix}.state`,
        message: clean(state)
          ? `Can't tell which Malaysian state "${clean(state)}" is — use the full state name (e.g. Selangor, Wilayah Persekutuan Kuala Lumpur).`
          : `Add ${who}'s state.`,
      });
    }
  } else {
    stateCode = clean(state) || "17";
  }
  if (addressLines.length === 0 || !clean(city) || !stateCode) return null;
  return {
    lines: addressLines.slice(0, 3),
    city: clean(city).slice(0, 50),
    postcode: clean(postcode) || null,
    stateCode,
    countryCode: iso3,
  };
}

/** The clinic as supplier: legal name, TIN, BRN (SSM), SST no. or NA, MSIC + activity, address, phone. */
export function supplierFromBranch(branch: BranchEInvoiceFields): Mapped<EInvoiceSupplier> {
  const errors: FieldError[] = [];
  const warnings: FieldError[] = [];
  const tin = clean(branch.tin).toUpperCase().replace(/\s+/g, "");
  if (!tin) errors.push({ field: "branch.tin", message: "Add the clinic's tax identification no. (TIN) in Billing & tax." });
  else if (!TIN_PATTERN.test(tin)) warnings.push({ field: "branch.tin", message: `TIN "${tin}" doesn't look like an LHDN TIN (e.g. C2584563200).` });

  const brn = normaliseBrn(branch.ssmRegNo);
  if (!brn) errors.push({ field: "branch.ssmRegNo", message: "Add the SSM registration no. (BRN) in Billing & tax." });
  else if (!/^\d{12}$/.test(brn)) warnings.push({ field: "branch.ssmRegNo", message: "LHDN expects the 12-digit SSM number (e.g. 202401012345)." });

  const msic = clean(branch.msicCode);
  if (!msic) errors.push({ field: "branch.msicCode", message: "Add the MSIC code in the e-Invoice settings." });
  else if (!/^\d{5}$/.test(msic)) errors.push({ field: "branch.msicCode", message: "MSIC code is 5 digits (e.g. 86909)." });

  const activity = clean(branch.businessActivity);
  if (!activity) errors.push({ field: "branch.businessActivity", message: "Add the business activity description in the e-Invoice settings." });

  const phone = e164Phone(branch.phone);
  if (!phone) errors.push({ field: "branch.phone", message: "Add a valid branch phone number (e.g. +60321410000)." });

  const address = malaysianAddress("branch", [branch.address], branch.city, branch.state, branch.zip, "MYS", errors);
  if (errors.length > 0 || !address || !phone) return { value: null, errors, warnings };

  return {
    value: {
      name: (clean(branch.legalName) || clean(branch.name)).slice(0, 300),
      tin,
      idScheme: "BRN",
      idValue: brn,
      sstNo: clean(branch.sstRegNo) || NOT_AVAILABLE,
      ttxNo: NOT_AVAILABLE,
      phone,
      email: clean(branch.email) || null,
      msicCode: msic,
      businessActivity: activity.slice(0, 300),
      address,
    },
    errors,
    warnings,
  };
}

/**
 * The patient as buyer (Specific Guideline v4.8 §3.5.7 Option 2 and §10.5):
 * a Malaysian with a MyKad → general TIN EI00000000010 + NRIC; anyone else
 * with a passport → EI00000000020 + PASSPORT. Without either, the invoice
 * can't be issued individually (leave it for the monthly consolidated one).
 */
export function buyerFromPatient(patient: PatientEInvoiceFields): Mapped<EInvoiceParty> {
  const errors: FieldError[] = [];
  const warnings: FieldError[] = [];
  const ic = clean(patient.icNumber).replace(/-/g, "");
  const passport = clean(patient.passportNumber).toUpperCase().replace(/\s+/g, "");
  const malaysian = isMalaysianPatient(patient);

  let tin = "";
  let idScheme: EInvoiceParty["idScheme"] = "NRIC";
  let idValue = "";
  if (malaysian && isValidMyKad(ic)) {
    tin = GENERAL_TIN.PUBLIC;
    idValue = ic;
  } else if (passport) {
    tin = malaysian ? GENERAL_TIN.PUBLIC : GENERAL_TIN.FOREIGN_BUYER;
    idScheme = "PASSPORT";
    idValue = passport.slice(0, 12);
  } else {
    errors.push({
      field: "patient.id",
      message: malaysian
        ? "Add the patient's MyKad (IC) number — or leave this invoice for the monthly consolidated e-invoice."
        : "Add the patient's passport number — or leave this invoice for the monthly consolidated e-invoice.",
    });
  }

  const phone = e164Phone(patient.phone);
  if (!phone) errors.push({ field: "patient.phone", message: "Add the patient's phone number (LHDN requires the buyer's contact number)." });

  const address = malaysianAddress(
    "patient",
    [patient.addressLine1 || patient.address, patient.addressLine2],
    patient.city,
    patient.state,
    patient.postcode,
    patient.country,
    errors,
  );
  const name = `${clean(patient.firstName)} ${clean(patient.lastName)}`.trim();
  if (errors.length > 0 || !address || !phone) return { value: null, errors, warnings };
  return {
    value: {
      name: name.slice(0, 300),
      tin,
      idScheme,
      idValue,
      sstNo: NOT_AVAILABLE,
      ttxNo: NOT_AVAILABLE,
      phone,
      email: clean(patient.email) || null,
      address,
    },
    errors,
    warnings,
  };
}

/**
 * Splits `totalSen` over `weights` in proportion, largest remainder first, so
 * the parts add up exactly (used to spread invoice-level SST over lines).
 */
export function allocate(totalSen: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (totalSen * w) / sum);
  const parts = raw.map(Math.floor);
  let left = totalSen - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

/**
 * Invoice lines with their SST. SmartChiro works SST out on the taxable base
 * (not per line), so the invoice's tax is spread over its taxable lines in
 * proportion; lines without SST get tax type 06 at 0%.
 */
export function linesFromInvoice(invoice: InvoiceEInvoiceFields, classification = DEFAULT_CLASSIFICATION): Mapped<EInvoiceLine[]> {
  const errors: FieldError[] = [];
  const warnings: FieldError[] = [];
  if (invoice.status === "DRAFT") errors.push({ field: "invoice.status", message: "Mark the invoice as sent (or take payment) before issuing an e-invoice." });
  if (invoice.status === "CANCELLED") errors.push({ field: "invoice.status", message: "A cancelled invoice can't be issued as an e-invoice." });
  if (invoice.currency !== "MYR") errors.push({ field: "invoice.currency", message: "Only MYR invoices are supported." });
  if (invoice.lineItems.length === 0) errors.push({ field: "invoice.lines", message: "The invoice has no items." });
  invoice.lineItems.forEach((line, i) => {
    if (!line.description.trim()) errors.push({ field: `invoice.lines.${i}`, message: `Item ${i + 1} has no description.` });
    if (line.total < 0) errors.push({ field: `invoice.lines.${i}`, message: `Item ${i + 1} is negative — issue a refund instead.` });
  });

  const taxSen = toSen(invoice.taxAmount);
  const taxed = taxSen > 0;
  const lineSen = invoice.lineItems.map((l) => toSen(l.total));
  const subtotalSen = lineSen.reduce((a, b) => a + b, 0);
  if (subtotalSen !== toSen(invoice.subtotal)) errors.push({ field: "invoice.totals", message: "Item amounts don't add up to the subtotal." });
  if (toSen(invoice.subtotal) + taxSen !== toSen(invoice.total)) errors.push({ field: "invoice.totals", message: "Subtotal plus tax doesn't equal the total." });
  if (taxed && !invoice.taxRate) errors.push({ field: "invoice.taxRate", message: "SST was charged but the rate is missing." });

  const taxableWeights = invoice.lineItems.map((l, i) => (taxed && l.taxable !== false ? lineSen[i] : 0));
  if (taxed && taxableWeights.every((w) => w === 0)) errors.push({ field: "invoice.totals", message: "SST was charged but no item is taxable." });
  const taxParts = allocate(taxSen, taxableWeights);
  if (errors.length > 0) return { value: null, errors, warnings };

  const lines = invoice.lineItems.map((l, i): EInvoiceLine => {
    const sstLine = taxableWeights[i] > 0;
    return {
      description: l.description.trim(),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      subtotal: fromSen(lineSen[i]),
      taxType: sstLine ? SST_TAX_TYPE : NO_TAX_TAX_TYPE,
      taxRate: sstLine ? Number(invoice.taxRate) : 0,
      taxAmount: fromSen(taxParts[i]),
      classification,
    };
  });
  return { value: lines, errors, warnings };
}

/** Taxable base (sum of lines that carried SST) — the consolidated line split needs it. */
export function taxableBase(invoice: Pick<InvoiceEInvoiceFields, "lineItems" | "taxAmount">): number {
  if (toSen(invoice.taxAmount) <= 0) return 0;
  return fromSen(invoice.lineItems.filter((l) => l.taxable !== false).reduce((s, l) => s + toSen(l.total), 0));
}

export interface RefundFields {
  receiptNumber: string;
  /** Negative, as stored on the payment. */
  amount: number;
  refundReason: string | null;
}

/**
 * Lines for a refund note: the refunded amount split back into base and SST
 * in the invoice's proportions (and into SST / non-SST items when it had both).
 */
export function refundLines(
  invoice: Pick<InvoiceEInvoiceFields, "invoiceNumber" | "lineItems" | "subtotal" | "taxAmount" | "taxRate" | "total">,
  refund: RefundFields,
  classification = DEFAULT_CLASSIFICATION,
): Mapped<EInvoiceLine[]> {
  const refundSen = -toSen(refund.amount);
  if (refundSen <= 0) return { value: null, errors: [{ field: "payment.amount", message: "Only refunds (negative payments) get a refund note." }], warnings: [] };
  const totalSen = toSen(invoice.total);
  const taxSen = toSen(invoice.taxAmount);
  let refundTaxSen = totalSen > 0 ? Math.round((refundSen * taxSen) / totalSen) : 0;
  const subtotalSen = toSen(invoice.subtotal);
  const taxableSen =
    refundTaxSen > 0 && subtotalSen > 0 ? Math.round(((refundSen - refundTaxSen) * toSen(taxableBase(invoice))) / subtotalSen) : 0;
  if (taxableSen === 0) refundTaxSen = 0;
  const otherSen = refundSen - refundTaxSen - taxableSen;
  const reason = refund.refundReason?.trim();
  const label = `Refund ${refund.receiptNumber} for invoice ${invoice.invoiceNumber}${reason ? ` — ${reason}` : ""}`;
  const lines: EInvoiceLine[] = [];
  if (taxableSen > 0) {
    lines.push({
      description: otherSen > 0 ? `${label} (SST items)` : label,
      quantity: 1,
      unitPrice: fromSen(taxableSen),
      subtotal: fromSen(taxableSen),
      taxType: SST_TAX_TYPE,
      taxRate: Number(invoice.taxRate ?? 0),
      taxAmount: fromSen(refundTaxSen),
      classification,
    });
  }
  if (otherSen > 0 || taxableSen === 0) {
    lines.push({
      description: taxableSen > 0 ? `${label} (non-SST items)` : label,
      quantity: 1,
      unitPrice: fromSen(otherSen),
      subtotal: fromSen(otherSen),
      taxType: NO_TAX_TAX_TYPE,
      taxRate: 0,
      taxAmount: 0,
      classification,
    });
  }
  return { value: lines, errors: [], warnings: [] };
}
