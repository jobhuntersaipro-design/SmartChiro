/** Stripe-style classes shared by the patient portal screens. */

export const CARD = "rounded-panel border border-border bg-white shadow-(--shadow-card)";

export const LABEL = "mb-1.5 block text-[15px] font-medium text-foreground";

export const INPUT =
  "h-11 w-full rounded-control border border-border bg-surface-muted px-3 text-[16px] text-foreground placeholder:text-fg-disabled transition-colors focus:border-brand focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60";

export const BTN_PRIMARY =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-4 text-[16px] font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export const BTN_SECONDARY =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-border bg-white px-3 text-[15px] font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60";

export const BTN_DANGER =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-border bg-white px-3 text-[15px] font-medium text-danger transition-colors hover:bg-danger-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:cursor-not-allowed disabled:opacity-60";

export const LINK = "font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-control";

export const ALERT_ERROR = "rounded-control border border-danger/20 bg-danger-subtle px-3 py-2 text-[15px] text-danger";

export const ALERT_INFO = "rounded-control border border-brand/20 bg-brand-subtle px-3 py-2 text-[15px] text-brand-strong";

export const PILL = "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[14px] font-medium";
