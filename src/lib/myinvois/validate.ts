/**
 * Pre-submission checks, field by field, so the clinic can fix problems before
 * LHDN rejects the document. These mirror the mandatory fields of the SDK's
 * Invoice v1.0 table (supplier TIN / BRN / MSIC / activity / address /
 * contact, buyer TIN + ID, address and contact, line items, totals); LHDN
 * runs more checks (TIN registration, code tables, duplicates) on its side.
 */
import { buyerFromPatient, linesFromInvoice, supplierFromBranch } from "./source";
import type { BranchEInvoiceFields, FieldError, InvoiceEInvoiceFields, PatientEInvoiceFields } from "./source";

export interface EInvoiceValidation {
  ok: boolean;
  errors: FieldError[];
  /** Worth fixing, but not blocking (LHDN may still accept the document). */
  warnings: FieldError[];
}

export function validateSupplier(branch: BranchEInvoiceFields): EInvoiceValidation {
  const s = supplierFromBranch(branch);
  return { ok: s.errors.length === 0, errors: s.errors, warnings: s.warnings };
}

export function validateInvoiceForEInvoice(input: {
  branch: BranchEInvoiceFields & { einvoiceEnabled: boolean };
  patient: PatientEInvoiceFields;
  invoice: InvoiceEInvoiceFields;
}): EInvoiceValidation {
  const errors: FieldError[] = [];
  const warnings: FieldError[] = [];
  if (!input.branch.einvoiceEnabled) {
    errors.push({ field: "branch.einvoiceEnabled", message: "e-Invoicing is turned off for this branch (Branch → Settings → e-Invoice)." });
  }
  for (const part of [supplierFromBranch(input.branch), buyerFromPatient(input.patient), linesFromInvoice(input.invoice)]) {
    errors.push(...part.errors);
    warnings.push(...part.warnings);
  }
  return { ok: errors.length === 0, errors, warnings };
}
