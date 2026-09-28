export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

/**
 * Overdue is derived, not stored: a sent invoice whose due date has passed.
 * (Stored OVERDUE rows from older data are treated the same.)
 */
export function effectiveInvoiceStatus(status: InvoiceStatus, dueDate: Date | null, now: Date = new Date()): InvoiceStatus {
  if ((status === "SENT" || status === "OVERDUE") && dueDate && dueDate.getTime() < now.getTime()) return "OVERDUE";
  if (status === "OVERDUE") return "SENT";
  return status;
}

const TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["SENT", "PAID", "CANCELLED"],
  SENT: ["PAID", "CANCELLED"],
  OVERDUE: ["PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
};

/** Status changes the front desk can make from here. Paid and cancelled are final (re-issue instead). */
export function allowedInvoiceTransitions(status: InvoiceStatus): InvoiceStatus[] {
  return TRANSITIONS[status];
}

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

const MYR = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", currencyDisplay: "code" });

/** "RM 1,234.50" — the Malaysian convention, regardless of browser locale. */
export function formatMYR(amount: number): string {
  return MYR.format(amount).replace(/^MYR\s?/, "RM ");
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
    }));
}

/** Unique invoice number ("INV-<time36>-<rand>"), same format as the appointment invoice route. */
export function generateInvoiceNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INV-${ts}-${rand}`;
}
