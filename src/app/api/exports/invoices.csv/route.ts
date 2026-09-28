import { accountingExportResponse } from "@/lib/accounting-export-server";

export const dynamic = "force-dynamic";

/** Invoices issued in the range (drafts excluded). */
export function GET(req: Request) {
  return accountingExportResponse(req, "invoices");
}
