import { NextResponse } from "next/server";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { connectionInfo, einvoiceAccess, einvoiceErrorResponse } from "@/lib/myinvois/access";
import { getMyInvoisClient } from "@/lib/myinvois/client";
import {
  EInvoiceError,
  consolidatedPreview,
  prepareConsolidatedDocuments,
  refreshRows,
  serializeSubmission,
  submitConsolidated,
} from "@/lib/myinvois/service";
import type { ConsolidatedPreview } from "@/types/einvoice";
import { paywallCurrentUser } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ branchId: string }> };

async function authorise(branchId: string) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = einvoiceAccess(role);
  // Consolidation is a filing task: OWNER / ADMIN only, even to preview.
  if (!access.manage) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return { user, access } as const;
}

function monthParam(req: Request): string {
  const month = new URL(req.url).searchParams.get("month");
  if (!month) throw new EInvoiceError("validation", 422, { field: "month" });
  return month;
}

/**
 * Preview of the monthly consolidated e-invoice (B2C invoices in that clinic
 * month that weren't issued individually), with past consolidated documents
 * for the month. `?format=json` downloads the UBL JSON (no credentials needed).
 */
export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const auth = await authorise(branchId);
  if (auth instanceof Response) return auth;
  try {
    const month = monthParam(req);
    if (new URL(req.url).searchParams.get("format") === "json") {
      const { prepared } = await prepareConsolidatedDocuments(branchId, month);
      const body = prepared.length === 1 ? prepared[0].prepared.document : prepared.map((p) => p.prepared.document);
      return new NextResponse(JSON.stringify(body, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="einvoice-consolidated-${month}.json"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    const result = await consolidatedPreview(branchId, month);
    const { rows } = await refreshRows(result.submissions, getMyInvoisClient());
    const preview: ConsolidatedPreview = {
      ...result.preview,
      submissions: rows.map((s) => serializeSubmission(s)),
      configured: connectionInfo().configured,
      einvoiceEnabled: result.branch.einvoiceEnabled,
      canManage: auth.access.manage,
    };
    return NextResponse.json(preview);
  } catch (e) {
    return einvoiceErrorResponse(e);
  }
}

/** Build and submit the consolidated e-invoice for a completed month. OWNER / ADMIN. */
export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const blocked = await paywallCurrentUser();
  if (blocked) return blocked;
  const { branchId } = await ctx.params;
  const auth = await authorise(branchId);
  if (auth instanceof Response) return auth;
  try {
    const month = monthParam(req);
    const rows = await submitConsolidated({ branchId, month, userId: auth.user.id });
    return NextResponse.json({ submissions: rows.map((r) => serializeSubmission(r)) }, { status: 201 });
  } catch (e) {
    return einvoiceErrorResponse(e);
  }
}
