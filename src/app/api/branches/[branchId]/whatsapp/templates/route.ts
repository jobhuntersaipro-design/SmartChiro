import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { branchAccess, toPublicAccount } from "@/lib/whatsapp/account";
import { decryptSecret } from "@/lib/whatsapp/crypto";
import { GraphError } from "@/lib/whatsapp/graph";
import { ensureReminderTemplates } from "@/lib/whatsapp/templates";

type RouteCtx = { params: Promise<{ branchId: string }> };

/** Creates any missing reminder template language and refreshes approval status. */
export async function POST(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const access = await branchAccess(branchId, true);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const account = await prisma.whatsAppAccount.findUnique({ where: { branchId } });
  if (!account) return NextResponse.json({ error: "not_connected" }, { status: 404 });

  try {
    const { status, errors } = await ensureReminderTemplates(
      account.wabaId,
      decryptSecret(account.accessTokenEnc),
    );
    const updated = await prisma.whatsAppAccount.update({
      where: { id: account.id },
      data: {
        templateStatus: status,
        templatesCheckedAt: new Date(),
        lastError: errors.length ? `Template setup: ${errors.join("; ")}` : null,
      },
    });
    return NextResponse.json({ account: toPublicAccount(updated), errors });
  } catch (e) {
    const message = e instanceof GraphError ? e.userMessage : "Could not reach Meta. Please try again.";
    return NextResponse.json({ error: "meta_error", message }, { status: 502 });
  }
}
