import { FileText } from "lucide-react";
import type { PortalInvoice } from "@/types/portal";
import { formatMYR } from "@/lib/invoices";
import { portalDate } from "@/components/portal/portal-format";
import { CARD, LINK, PILL } from "@/components/portal/styles";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<string, string> = {
  PAID: "bg-success-subtle text-success",
  PARTIALLY_PAID: "bg-warning-subtle text-warning",
  OVERDUE: "bg-danger-subtle text-danger",
  SENT: "bg-brand-subtle text-brand",
};

interface Props {
  invoices: PortalInvoice[];
  showPatientName: boolean;
}

function Money({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[14px] text-fg-muted">{label}</dt>
      <dd className={cn("whitespace-nowrap text-[15px]", strong ? "font-medium text-foreground" : "text-fg-secondary")}>
        {formatMYR(value)}
      </dd>
    </div>
  );
}

/** Invoices with totals, balance, and PDF links for the invoice and each receipt. */
export function PortalInvoices({ invoices, showPatientName }: Props) {
  if (invoices.length === 0) {
    return <p className={cn(CARD, "p-4 text-[15px] text-fg-secondary")}>You have no invoices.</p>;
  }
  return (
    <ul className="space-y-3">
      {invoices.map((inv) => (
        <li key={inv.id} className={cn(CARD, "p-4")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[15px] font-medium text-foreground">{inv.invoiceNumber}</p>
              <p className="text-[14px] text-fg-muted">
                {portalDate(inv.issuedAt)} · {inv.branchName}
                {showPatientName && ` · ${inv.patientFirstName}`}
              </p>
            </div>
            <span className={cn(PILL, STATUS_CLASS[inv.status] ?? "bg-surface-hover text-fg-secondary")}>{inv.statusLabel}</span>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            <Money label="Total" value={inv.total} strong />
            <Money label="Paid" value={inv.paid} />
            <Money label="Balance" value={inv.balance} strong={inv.balance > 0} />
          </dl>
          <div className="mt-3 border-t border-border pt-3">
            <a
              href={`/api/portal/invoices/${encodeURIComponent(inv.id)}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(LINK, "inline-flex items-center gap-1.5 text-[15px]")}
            >
              <FileText className="size-4" strokeWidth={1.5} aria-hidden />
              {inv.status === "PAID" ? "Receipt" : "Invoice"} PDF
            </a>
            {inv.receipts.length > 0 && (
              <ul className="mt-2 space-y-1.5" aria-label={`Payments on ${inv.invoiceNumber}`}>
                {inv.receipts.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 text-[14px] text-fg-secondary">
                    <span>
                      {portalDate(r.receivedAt)} · {r.method} · <span className="whitespace-nowrap">{formatMYR(r.amount)}</span>
                    </span>
                    <a
                      href={`/api/portal/invoices/${encodeURIComponent(inv.id)}/payments/${encodeURIComponent(r.id)}/receipt`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(LINK, "font-mono")}
                    >
                      {r.amount < 0 ? "Refund" : "Receipt"} {r.receiptNumber}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
