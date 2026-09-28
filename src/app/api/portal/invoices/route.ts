import { loadPortalInvoices } from "@/lib/portal/data";
import { portalJson, withPortal } from "@/lib/portal/http";

/** Issued invoices (never drafts or cancelled ones) with their payment receipts. */
export function GET(req: Request): Promise<Response> {
  return withPortal(req, async (session) => portalJson({ invoices: await loadPortalInvoices(session) }));
}
