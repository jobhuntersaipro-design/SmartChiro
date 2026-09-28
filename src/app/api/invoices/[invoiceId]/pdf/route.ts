import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { can } from "@/lib/permissions";
import { effectiveInvoiceStatus, parseLineItems, type InvoiceStatus } from "@/lib/invoices";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

type RouteCtx = { params: Promise<{ invoiceId: string }> };

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Awaiting payment",
  OVERDUE: "Overdue",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

/** Printable invoice PDF, or a receipt once the invoice is paid. OWNER/ADMIN/FRONT_DESK of its branch. */
export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { invoiceId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      patient: { select: { firstName: true, lastName: true, icNumber: true, phone: true, email: true } },
      branch: { select: { name: true, address: true, city: true, state: true, zip: true, phone: true, email: true } },
    },
  });
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const role = await getUserBranchRole(user.id, invoice.branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!can(role, "invoice.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const status = effectiveInvoiceStatus(invoice.status as InvoiceStatus, invoice.dueDate);
  const kind = status === "PAID" ? "RECEIPT" : "INVOICE";
  const { branch, patient } = invoice;
  const bytes = await renderInvoicePdf({
    kind,
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.createdAt,
    dueDate: invoice.dueDate,
    paidAt: invoice.paidAt,
    statusLabel: STATUS_LABEL[status],
    clinic: {
      name: branch.name,
      lines: [
        branch.address,
        [branch.zip, branch.city, branch.state].filter(Boolean).join(" "),
        [branch.phone, branch.email].filter(Boolean).join("  ·  "),
      ].filter((line): line is string => Boolean(line)),
    },
    patient: {
      name: `${patient.firstName} ${patient.lastName}`,
      lines: [patient.icNumber ? `IC ${patient.icNumber}` : null, patient.phone, patient.email].filter(
        (line): line is string => Boolean(line),
      ),
    },
    items: parseLineItems(invoice.lineItems),
    total: Number(invoice.amount),
    notes: invoice.notes,
  });

  const fileName = `${kind === "RECEIPT" ? "receipt" : "invoice"}-${invoice.invoiceNumber}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
