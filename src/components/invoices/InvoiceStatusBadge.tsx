import type { AnyInvoiceStatus } from "@/lib/invoices";

export const INVOICE_STATUS_STYLE: Record<AnyInvoiceStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-surface-hover text-fg-secondary" },
  SENT: { label: "Sent", className: "bg-info-subtle text-info" },
  OVERDUE: { label: "Overdue", className: "bg-danger-subtle text-danger" },
  PARTIALLY_PAID: { label: "Part paid", className: "bg-warning-subtle text-warning" },
  PAID: { label: "Paid", className: "bg-success-subtle text-success" },
  CANCELLED: { label: "Cancelled", className: "bg-surface-hover text-fg-muted" },
};

export function InvoiceStatusBadge({ status }: { status: AnyInvoiceStatus }) {
  const style = INVOICE_STATUS_STYLE[status] ?? INVOICE_STATUS_STYLE.DRAFT;
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[13px] font-medium ${style.className}`}>
      {style.label}
    </span>
  );
}
