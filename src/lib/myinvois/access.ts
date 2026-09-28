import { NextResponse } from "next/server";
import { billingAccess } from "@/lib/billing-access";
import { getDocumentSigner } from "./signer";
import { myInvoisStatus } from "./client";
import { EInvoiceError } from "./service";

/**
 * e-Invoice rights in a branch: anyone who can read invoices sees the
 * e-invoice status and can download the JSON; only OWNER / ADMIN submit,
 * cancel and run the monthly consolidation (they file with LHDN for the business).
 */
export function einvoiceAccess(role: string | null | undefined) {
  return { read: billingAccess(role).read, manage: role === "OWNER" || role === "ADMIN" };
}

/** Connection facts for the UI — never the credentials themselves. */
export function connectionInfo() {
  return { ...myInvoisStatus(), documentVersion: getDocumentSigner().version };
}

/** JSON response for an EInvoiceError; rethrows anything else. */
export function einvoiceErrorResponse(err: unknown): Response {
  if (err instanceof EInvoiceError) {
    return NextResponse.json({ error: err.code, ...(err.details ?? {}) }, { status: err.status });
  }
  throw err;
}
