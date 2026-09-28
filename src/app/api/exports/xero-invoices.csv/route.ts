import { accountingExportResponse } from "@/lib/accounting-export-server";

export const dynamic = "force-dynamic";

/** Xero sales-invoice import file for invoices issued in the range. */
export function GET(req: Request) {
  return accountingExportResponse(req, "xero-invoices");
}
