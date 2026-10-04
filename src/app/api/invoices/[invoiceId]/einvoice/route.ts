import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { connectionInfo, einvoiceAccess, einvoiceErrorResponse } from "@/lib/myinvois/access";
import { getMyInvoisClient } from "@/lib/myinvois/client";
import {
  loadInvoiceForEInvoice,
  portalBaseUrl,
  refreshRows,
  serializeSubmission,
  submitInvoiceEInvoice,
  validateInvoiceRow,
  type EInvoiceInvoiceRow,
} from "@/lib/myinvois/service";
import type { InvoiceEInvoiceState } from "@/types/einvoice";
import { paywallCurrentUser } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ invoiceId: string }> };

async function authorise(invoiceId: string) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const invoice = await loadInvoiceForEInvoice(invoiceId);
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const role = await getUserBranchRole(user.id, invoice.branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = einvoiceAccess(role);
  if (!access.read) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return { user, invoice, access } as const;
}

function state(inv: EInvoiceInvoiceRow, canManage: boolean, refreshError: string | null): InvoiceEInvoiceState {
  const portal = portalBaseUrl();
  const own = inv.einvoiceSubmissions.filter((s) => s.kind === "INVOICE");
  return {
    ...connectionInfo(),
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    einvoiceStatus: inv.einvoiceStatus,
    einvoiceEnabled: inv.branch.einvoiceEnabled,
    canManage,
    validation: validateInvoiceRow(inv),
    current: own[0] ? serializeSubmission(own[0], portal) : null,
    consolidatedInto: inv.consolidatedInto ? serializeSubmission(inv.consolidatedInto, portal) : null,
    refunds: inv.payments.map((p) => {
      const note = inv.einvoiceSubmissions.find((s) => s.kind === "REFUND_NOTE" && s.paymentId === p.id);
      return {
        paymentId: p.id,
        receiptNumber: p.receiptNumber,
        amount: Number(p.amount),
        receivedAt: p.receivedAt.toISOString(),
        note: note ? serializeSubmission(note, portal) : null,
      };
    }),
    history: inv.einvoiceSubmissions.map((s) => serializeSubmission(s, portal)),
    refreshError,
  };
}

/**
 * e-Invoice status of an invoice with its pre-submission check. Documents
 * still being validated by LHDN are refreshed first (fail-soft).
 */
export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { invoiceId } = await ctx.params;
  const auth = await authorise(invoiceId);
  if (auth instanceof Response) return auth;
  let invoice = auth.invoice;

  const pending = [...invoice.einvoiceSubmissions, ...(invoice.consolidatedInto ? [invoice.consolidatedInto] : [])].filter(
    (s) => s.status === "SUBMITTED",
  );
  let refreshError: string | null = null;
  if (pending.length > 0) {
    const client = getMyInvoisClient();
    const { error } = await refreshRows(pending, client);
    refreshError = client ? error : "MyInvois isn't configured, so the status can't be refreshed.";
    invoice = (await loadInvoiceForEInvoice(invoiceId)) ?? invoice;
  }
  return NextResponse.json(state(invoice, auth.access.manage, refreshError));
}

const Body = z
  .object({
    /** Submit a refund note for this refund payment instead of the invoice. */
    paymentId: z.string().min(1).optional(),
  })
  .strict();

/** Submit the invoice (or a refund note) to LHDN. OWNER / ADMIN. */
export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const blocked = await paywallCurrentUser();
  if (blocked) return blocked;
  const { invoiceId } = await ctx.params;
  const auth = await authorise(invoiceId);
  if (auth instanceof Response) return auth;
  if (!auth.access.manage) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const text = await req.text();
  let raw: unknown = {};
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "validation" }, { status: 422 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 422 });

  try {
    const submission = await submitInvoiceEInvoice({ invoiceId, paymentId: parsed.data.paymentId ?? null, userId: auth.user.id });
    const invoice = (await loadInvoiceForEInvoice(invoiceId))!;
    return NextResponse.json({ submission: serializeSubmission(submission), state: state(invoice, true, null) }, { status: 201 });
  } catch (e) {
    return einvoiceErrorResponse(e);
  }
}
