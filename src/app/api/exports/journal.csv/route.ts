import { accountingExportResponse } from "@/lib/accounting-export-server";

export const dynamic = "force-dynamic";

/** Double-entry journal (invoices + payments) for AutoCount / SQL Account. */
export function GET(req: Request) {
  return accountingExportResponse(req, "journal");
}
