/** Shared Stripe-style classes for the billing forms and panels. */

export const FIELD_LABEL = "mb-1 block text-[13px] font-medium text-foreground";

export const FIELD_INPUT =
  "flex h-9 w-full rounded-control border border-border bg-surface-muted px-3 text-[15px] text-foreground placeholder:text-fg-disabled transition-colors focus:border-brand focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60";

export const FIELD_TEXTAREA =
  "flex w-full resize-none rounded-control border border-border bg-surface-muted px-3 py-2 text-[15px] text-foreground placeholder:text-fg-disabled transition-colors focus:border-brand focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60";

export const FIELD_ERROR = "mt-1 text-[12px] text-danger";

export const INVALID = "border-danger/60 focus:border-danger focus:ring-danger";

export const BTN_PRIMARY =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-primary px-4 text-[14px] font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60";

export const BTN_SECONDARY =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-border bg-white px-3 text-[14px] font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60";

export const BTN_DANGER =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-border bg-white px-3 text-[14px] font-medium text-danger transition-colors hover:bg-danger-subtle disabled:cursor-not-allowed disabled:opacity-60";

export const ALERT_ERROR = "rounded-control border border-danger/20 bg-danger-subtle px-3 py-2 text-[13px] text-danger";
