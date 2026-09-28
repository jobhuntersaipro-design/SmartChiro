import { can } from "@/lib/permissions";

/**
 * Who can do what with invoices and payments in a branch, on top of the
 * shared permission map: whoever has `invoice.manage` (OWNER / ADMIN /
 * FRONT_DESK) creates invoices and records payments; doctors can read their
 * branch's invoices and receipts; only OWNER / ADMIN refund.
 */
export interface BillingAccess {
  /** See invoices, payments and receipts. */
  read: boolean;
  /** Create invoices, record payments, change status. */
  manage: boolean;
  /** Record refunds (negative payments). */
  refund: boolean;
}

export function billingAccess(role: string | null | undefined): BillingAccess {
  const manage = can(role, "invoice.manage");
  return {
    read: manage || role === "DOCTOR",
    manage,
    refund: role === "OWNER" || role === "ADMIN",
  };
}
