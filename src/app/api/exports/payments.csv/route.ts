import { accountingExportResponse } from "@/lib/accounting-export-server";

export const dynamic = "force-dynamic";

/** Payments and refunds received in the range. */
export function GET(req: Request) {
  return accountingExportResponse(req, "payments");
}
