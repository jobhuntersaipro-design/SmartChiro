import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { einvoiceAccess, einvoiceErrorResponse } from "@/lib/myinvois/access";
import { loadInvoiceForEInvoice, prepareInvoiceDocument, prepareRefundNote } from "@/lib/myinvois/service";

type RouteCtx = { params: Promise<{ invoiceId: string }> };

/**
 * The UBL 2.1 JSON e-invoice for this invoice (or `?paymentId=` refund note),
 * as it would be submitted now. Works without MyInvois credentials and while
 * the branch toggle is off. `?submitted=1` returns the exact JSON already sent.
 */
export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  const { invoiceId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const invoice = await loadInvoiceForEInvoice(invoiceId);
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const role = await getUserBranchRole(user.id, invoice.branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!einvoiceAccess(role).read) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const paymentId = url.searchParams.get("paymentId");
  const fileBase = paymentId ? invoice.payments.find((p) => p.id === paymentId)?.receiptNumber ?? "refund-note" : invoice.invoiceNumber;

  if (url.searchParams.get("submitted") === "1") {
    const sent = await prisma.eInvoiceSubmission.findFirst({
      where: { invoiceId, kind: paymentId ? "REFUND_NOTE" : "INVOICE", ...(paymentId ? { paymentId } : {}), document: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { document: true },
    });
    if (!sent?.document) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return download(sent.document, fileBase);
  }

  try {
    const now = new Date();
    const { validation, prepared } = paymentId
      ? await prepareRefundNote(invoice, paymentId, now, { ignoreEnabled: true })
      : await prepareInvoiceDocument(invoice, now, { ignoreEnabled: true });
    if (!prepared) return NextResponse.json({ error: "validation_failed", errors: validation.errors, warnings: validation.warnings }, { status: 422 });
    return download(JSON.stringify(prepared.document, null, 2), fileBase);
  } catch (e) {
    return einvoiceErrorResponse(e);
  }
}

function download(json: string, name: string): Response {
  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="einvoice-${name.replace(/[^A-Za-z0-9._-]/g, "_")}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
