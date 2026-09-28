/** Shapes returned by the MyInvois (LHDN e-invoice) API routes. */

export type EInvoiceStatusValue = "NOT_SUBMITTED" | "SUBMITTED" | "VALID" | "INVALID" | "CANCELLED";
export type EInvoiceKindValue = "INVOICE" | "CREDIT_NOTE" | "REFUND_NOTE" | "CONSOLIDATED";

export interface EInvoiceFieldError {
  field: string;
  message: string;
}

export interface EInvoiceValidationResult {
  ok: boolean;
  errors: EInvoiceFieldError[];
  warnings: EInvoiceFieldError[];
}

export interface EInvoiceSubmissionView {
  id: string;
  kind: EInvoiceKindValue;
  status: EInvoiceStatusValue;
  codeNumber: string;
  documentVersion: string;
  documentHash: string;
  submissionUid: string | null;
  uuid: string | null;
  longId: string | null;
  validationUrl: string | null;
  /** LHDN / transport errors: `{ code, message, path }`. */
  errors: { code: string | null; message: string; path: string | null }[];
  paymentId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  submittedAt: string | null;
  validatedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Until when LHDN still allows cancelling (72 h after validation), when VALID. */
  cancellableUntil: string | null;
  createdAt: string;
}

export interface EInvoiceConnection {
  configured: boolean;
  environment: "sandbox" | "production";
  intermediary: boolean;
  documentVersion: string;
}

/** GET /api/invoices/[id]/einvoice */
export interface InvoiceEInvoiceState extends EInvoiceConnection {
  invoiceId: string;
  invoiceNumber: string;
  einvoiceStatus: EInvoiceStatusValue;
  einvoiceEnabled: boolean;
  canManage: boolean;
  validation: EInvoiceValidationResult;
  /** Latest document for this invoice itself. */
  current: EInvoiceSubmissionView | null;
  /** The monthly consolidated e-invoice this invoice was rolled into, if any. */
  consolidatedInto: EInvoiceSubmissionView | null;
  refunds: {
    paymentId: string;
    receiptNumber: string;
    amount: number;
    receivedAt: string;
    note: EInvoiceSubmissionView | null;
  }[];
  history: EInvoiceSubmissionView[];
  /** Set when the status refresh from LHDN failed (the stored status is shown). */
  refreshError: string | null;
}

/** GET/PUT /api/branches/[id]/einvoice */
export interface BranchEInvoiceSettings extends EInvoiceConnection {
  branchId: string;
  msicCode: string | null;
  businessActivity: string | null;
  einvoiceEnabled: boolean;
  /** Derived from the branch address; null when it can't be worked out. */
  stateCode: string | null;
  stateName: string | null;
  readiness: EInvoiceValidationResult;
  canEdit: boolean;
}

/** GET /api/branches/[id]/einvoice/consolidated?month=YYYY-MM */
export interface ConsolidatedPreview {
  month: string;
  periodStart: string;
  periodEnd: string;
  /** Month has ended (consolidation only for completed months). */
  monthEnded: boolean;
  /** Last day to submit (7 calendar days after month end), YYYY-MM-DD. */
  dueBy: string;
  late: boolean;
  included: { id: string; invoiceNumber: string; issuedAt: string; patientName: string; subtotal: number; taxAmount: number; total: number }[];
  excluded: { id: string; invoiceNumber: string; total: number; reason: "over_limit" | "zero_amount" }[];
  totals: { subtotal: number; taxAmount: number; total: number; documents: number };
  submissions: EInvoiceSubmissionView[];
  supplier: EInvoiceValidationResult;
  configured: boolean;
  einvoiceEnabled: boolean;
  canManage: boolean;
}
