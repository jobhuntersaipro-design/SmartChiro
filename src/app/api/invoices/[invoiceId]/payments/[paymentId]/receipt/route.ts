import { NextResponse } from "next/server";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { billingAccess } from "@/lib/billing-access";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { loadInvoiceDetail, paymentReceiptPdfData } from "@/lib/invoice-detail";

type RouteCtx = { params: Promise<{ invoiceId: string; paymentId: string }> };

/** Receipt PDF for one payment (or refund): method, reference, receipt number and the balance after it. */
export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { invoiceId, paymentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const invoice = await loadInvoiceDetail(invoiceId);
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // TODO(front-desk): FRONT_DESK prints receipts too.
  if (!billingAccess(await getUserBranchRole(user.id, invoice.branchId)).read) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const data = paymentReceiptPdfData(invoice, paymentId);
  if (!data?.payment) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const bytes = await renderInvoicePdf(data);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${data.payment.receiptNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
