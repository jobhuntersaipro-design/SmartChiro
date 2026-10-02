import type { EInvoiceStatusValue } from "@/types/einvoice";

const STYLE: Record<EInvoiceStatusValue, { label: string; className: string }> = {
  NOT_SUBMITTED: { label: "Not submitted", className: "bg-surface-muted text-fg-secondary border-border" },
  SUBMITTED: { label: "Validating", className: "bg-info-subtle text-info border-info/20" },
  VALID: { label: "Valid", className: "bg-success-subtle text-success border-success/25" },
  INVALID: { label: "Invalid", className: "bg-danger-subtle text-danger border-danger/20" },
  CANCELLED: { label: "Cancelled", className: "bg-surface-muted text-fg-muted border-border" },
};

/** LHDN e-invoice status as a pill. */
export function EInvoiceStatusPill({ status }: { status: EInvoiceStatusValue }) {
  const s = STYLE[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap ${s.className}`}>
      {s.label}
    </span>
  );
}

/** Human text for an API error code from the e-invoice routes. */
export function einvoiceErrorMessage(code: string | undefined, fallback = "Something went wrong."): string {
  switch (code) {
    case "myinvois_not_configured":
      return "LHDN MyInvois isn't connected yet — set MYINVOIS_CLIENT_ID and MYINVOIS_CLIENT_SECRET on the server. You can still download the JSON.";
    case "validation_failed":
      return "Fix the highlighted details before submitting.";
    case "already_submitted":
      return "This document has already been submitted.";
    case "already_consolidated":
      return "This invoice is already in a monthly consolidated e-invoice.";
    case "signer_not_configured":
      return "Document version 1.1 needs a digital certificate that isn't configured.";
    case "einvoice_disabled":
      return "e-Invoicing is turned off for this branch.";
    case "month_not_ended":
      return "A consolidated e-invoice can only be issued after the month ends.";
    case "nothing_to_consolidate":
      return "There are no invoices to consolidate for that month.";
    case "cancel_window_passed":
      return "LHDN only allows cancelling within 72 hours of validation — issue a refund note instead.";
    case "myinvois_error":
    case "myinvois_unreachable":
      return "LHDN MyInvois rejected or didn't answer the request. Try again shortly.";
    default:
      return fallback;
  }
}
