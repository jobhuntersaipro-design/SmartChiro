import type { AnyInvoiceStatus } from "@/lib/invoices";

export const INVOICE_STATUS_STYLE: Record<AnyInvoiceStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-[#f0f3f7] text-[#425466]" },
  SENT: { label: "Sent", className: "bg-[#e6f0fc] text-[#0570DE]" },
  OVERDUE: { label: "Overdue", className: "bg-[#fdecef] text-[#b41a36]" },
  PARTIALLY_PAID: { label: "Part paid", className: "bg-[#fef3e2] text-[#9b6829]" },
  PAID: { label: "Paid", className: "bg-[#e6f9ee] text-[#108c3d]" },
  CANCELLED: { label: "Cancelled", className: "bg-[#f0f3f7] text-[#697386]" },
};

export function InvoiceStatusBadge({ status }: { status: AnyInvoiceStatus }) {
  const style = INVOICE_STATUS_STYLE[status] ?? INVOICE_STATUS_STYLE.DRAFT;
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[13px] font-medium ${style.className}`}>
      {style.label}
    </span>
  );
}
