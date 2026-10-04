import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { einvoiceAccess, einvoiceErrorResponse } from "@/lib/myinvois/access";
import { cancelSubmission, serializeSubmission } from "@/lib/myinvois/service";
import { paywall } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ submissionId: string }> };

const Body = z.object({ reason: z.string().trim().min(3).max(300) }).strict();

/**
 * Cancel a validated e-invoice / refund note / consolidated e-invoice with
 * LHDN (allowed within 72 hours of validation; afterwards issue a credit or
 * refund note). OWNER / ADMIN.
 */
export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const { submissionId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const blocked = await paywall(user.id);
  if (blocked) return blocked;
  const row = await prisma.eInvoiceSubmission.findUnique({ where: { id: submissionId }, select: { branchId: true } });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const role = await getUserBranchRole(user.id, row.branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!einvoiceAccess(role).manage) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 422 });

  try {
    const submission = await cancelSubmission({ submissionId, reason: parsed.data.reason });
    return NextResponse.json({ submission: serializeSubmission(submission) });
  } catch (e) {
    return einvoiceErrorResponse(e);
  }
}
