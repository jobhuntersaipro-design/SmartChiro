import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { isManagerRole } from "@/lib/package-access";
import { PATIENT_PACKAGE_INCLUDE, serializePatientPackage, userNamesFor } from "@/lib/package-service";
import { cancelInvoiceData, type AnyInvoiceStatus } from "@/lib/invoices";

type RouteCtx = { params: Promise<{ packageId: string }> };

const Body = z
  .object({
    /** Cancel the package. Remaining sessions can no longer be redeemed. */
    status: z.literal("CANCELLED").optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    /** Also cancel the sale invoice (refused when it is already paid). */
    cancelInvoice: z.boolean().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((d) => d.status !== undefined || d.notes !== undefined, "nothing to change")
  .refine((d) => d.status !== "CANCELLED" || !!d.reason, { message: "a reason is required to cancel", path: ["reason"] });

/** Cancel a package (with reason) or edit its notes. OWNER/ADMIN. */
export async function PATCH(req: Request, ctx: RouteCtx): Promise<Response> {
  const { packageId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Sign in required." }, { status: 401 });

  const pkg = await prisma.patientPackage.findUnique({
    where: { id: packageId },
    select: { id: true, branchId: true, status: true, invoiceId: true, invoice: { select: { status: true } } },
  });
  const role = pkg ? await getUserBranchRole(user.id, pkg.branchId) : null;
  if (!pkg || !role) return NextResponse.json({ error: "not_found", message: "Package not found." }, { status: 404 });
  if (!isManagerRole(role)) {
    return NextResponse.json({ error: "forbidden", message: "Only owners and admins can change packages." }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", message: "Give a reason to cancel the package.", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const d = parsed.data;
  if (d.status === "CANCELLED" && pkg.status === "CANCELLED") {
    return NextResponse.json({ error: "already_cancelled", message: "This package is already cancelled." }, { status: 409 });
  }
  if (d.cancelInvoice && pkg.invoice?.status === "PAID") {
    return NextResponse.json(
      { error: "invoice_already_paid", message: "The sale invoice is paid — refund it instead of cancelling." },
      { status: 422 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (d.status === "CANCELLED" && d.cancelInvoice && pkg.invoiceId && pkg.invoice && pkg.invoice.status !== "CANCELLED") {
      await tx.invoice.update({ where: { id: pkg.invoiceId }, data: cancelInvoiceData(pkg.invoice.status as AnyInvoiceStatus) });
    }
    return tx.patientPackage.update({
      where: { id: packageId },
      data: {
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
        ...(d.status === "CANCELLED" ? { status: "CANCELLED" as const, cancelledAt: new Date(), cancelReason: d.reason } : {}),
      },
      include: PATIENT_PACKAGE_INCLUDE,
    });
  });
  const names = await userNamesFor([updated]);
  return NextResponse.json({ package: serializePatientPackage(updated, names) });
}
