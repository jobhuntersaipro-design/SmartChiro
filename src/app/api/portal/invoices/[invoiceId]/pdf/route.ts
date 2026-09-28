import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { invoicePdfData, loadInvoiceDetail } from "@/lib/invoice-detail";
import { portalMayOpenInvoice } from "@/lib/portal/data";
import { pdfResponse } from "@/lib/portal/pdf";
import { portalJson, withPortal } from "@/lib/portal/http";

type RouteCtx = { params: Promise<{ invoiceId: string }> };

/** The invoice PDF (a receipt once paid in full) — only for the session's own issued invoices. */
export function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  return withPortal(req, async (session) => {
    const { invoiceId } = await ctx.params;
    const invoice = invoiceId.length <= 64 ? await loadInvoiceDetail(invoiceId) : null;
    if (!invoice || !portalMayOpenInvoice(session, invoice)) return portalJson({ error: "not_found" }, 404);
    const data = invoicePdfData(invoice);
    const kind = data.kind === "RECEIPT" ? "receipt" : "invoice";
    return pdfResponse(await renderInvoicePdf(data), `${kind}-${invoice.invoiceNumber}.pdf`);
  });
}
