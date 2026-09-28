import { NextResponse } from "next/server";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { billingAccess } from "@/lib/billing-access";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { invoicePdfData, loadInvoiceDetail } from "@/lib/invoice-detail";

type RouteCtx = { params: Promise<{ invoiceId: string }> };

/**
 * Printable invoice PDF (tax breakdown, payments made, balance), or a
 * receipt once the invoice is paid in full.
 */
export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { invoiceId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const invoice = await loadInvoiceDetail(invoiceId);
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const role = await getUserBranchRole(user.id, invoice.branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!billingAccess(role).read) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const data = invoicePdfData(invoice);
  const bytes = await renderInvoicePdf(data);
  const fileName = `${data.kind === "RECEIPT" ? "receipt" : "invoice"}-${invoice.invoiceNumber}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
