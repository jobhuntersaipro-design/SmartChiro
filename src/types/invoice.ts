import type { PaymentMethod } from "@prisma/client";
import type { AnyInvoiceStatus, InvoiceLineItem } from "@/lib/invoices";

/** A row of GET /api/invoices. */
export interface InvoiceListRow {
  id: string;
  invoiceNumber: string;
  amount: number;
  amountPaid: number;
  balance: number;
  status: AnyInvoiceStatus;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string };
  branch?: { name: string };
}

export interface InvoiceListSummary {
  outstanding: number;
  overdue: number;
  overdueCount: number;
  paidThisMonth: number;
  draftCount: number;
}

/** One payment (or refund, amount < 0) on an invoice. */
export interface InvoicePayment {
  id: string;
  amount: number;
  isRefund: boolean;
  method: PaymentMethod;
  methodLabel: string;
  reference: string | null;
  receivedAt: string;
  receivedBy: { id: string; name: string | null } | null;
  notes: string | null;
  receiptNumber: string;
  refundReason: string | null;
  createdAt: string;
}

/** GET /api/invoices/[id] → `invoice`. */
export interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  status: AnyInvoiceStatus;
  currency: string;
  issuedAt: string;
  dueDate: string | null;
  paidAt: string | null;
  notes: string | null;
  appointmentId: string | null;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  amount: number;
  amountPaid: number;
  balance: number;
  taxRate: number | null;
  taxLabel: string | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    icNumber: string | null;
    nationality: string | null;
    isMalaysian: boolean;
  };
  branch: {
    id: string;
    name: string;
    legalName: string | null;
    ssmRegNo: string | null;
    tin: string | null;
    sstRegNo: string | null;
    sstEnabled: boolean;
    sstRate: number;
    paymentInstructions: string | null;
  };
  payments: InvoicePayment[];
  createdAt: string;
  updatedAt: string;
}

/** GET/PUT /api/branches/[id]/billing → `billing`. */
export interface BranchBillingSettings {
  branchId: string;
  legalName: string | null;
  ssmRegNo: string | null;
  tin: string | null;
  sstRegNo: string | null;
  sstEnabled: boolean;
  sstRate: number;
  invoicePrefix: string | null;
  paymentInstructions: string | null;
  effectivePrefix: string;
  nextInvoiceNumber: string;
  nextReceiptNumber: string;
}

/** A patient as the invoice dialog needs it (picker row or the patient page). */
export interface InvoicePatientOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  branchId?: string;
  nationality?: string | null;
  /** Whether SST treats the patient as Malaysian; undefined when not known. */
  isMalaysian?: boolean;
}
