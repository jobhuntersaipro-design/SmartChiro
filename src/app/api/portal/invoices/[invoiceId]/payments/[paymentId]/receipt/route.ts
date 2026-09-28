import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { loadInvoiceDetail, paymentReceiptPdfData } from "@/lib/invoice-detail";
import { portalMayOpenInvoice } from "@/lib/portal/data";
import { pdfResponse } from "@/lib/portal/pdf";
import { portalJson, withPortal } from "@/lib/portal/http";

type RouteCtx = { params: Promise<{ invoiceId: string; paymentId: string }> };

/** Receipt PDF for one payment on one of the session's own issued invoices. */
export function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  return withPortal(req, async (session) => {
    const { invoiceId, paymentId } = await ctx.params;
    const invoice = invoiceId.length <= 64 ? await loadInvoiceDetail(invoiceId) : null;
    if (!invoice || !portalMayOpenInvoice(session, invoice)) return portalJson({ error: "not_found" }, 404);
    const data = paymentReceiptPdfData(invoice, paymentId);
    if (!data?.payment) return portalJson({ error: "not_found" }, 404);
    return pdfResponse(await renderInvoicePdf(data), `receipt-${data.payment.receiptNumber}.pdf`);
  });
}
