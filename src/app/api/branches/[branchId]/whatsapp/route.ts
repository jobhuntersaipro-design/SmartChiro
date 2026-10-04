import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { branchAccess, toPublicAccount } from "@/lib/whatsapp/account";
import { signupConfig } from "@/lib/whatsapp/config";
import { decryptSecret } from "@/lib/whatsapp/crypto";
import { unsubscribeApp } from "@/lib/whatsapp/onboarding";
import { paywallCurrentUser } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ branchId: string }> };

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const access = await branchAccess(branchId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const account = await prisma.whatsAppAccount.findUnique({ where: { branchId } });
  return NextResponse.json({
    account: account ? toPublicAccount(account) : null,
    signup: signupConfig(),
    canManage: access.role === "OWNER" || access.role === "ADMIN",
  });
}

export async function DELETE(_req: Request, ctx: RouteCtx): Promise<Response> {
  const blocked = await paywallCurrentUser();
  if (blocked) return blocked;
  const { branchId } = await ctx.params;
  const access = await branchAccess(branchId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const account = await prisma.whatsAppAccount.findUnique({ where: { branchId } });
  if (!account) return NextResponse.json({ ok: true });

  // Best effort: stop Meta sending this WABA's webhooks to us. Only when no
  // other branch shares the WABA. The row is deleted either way.
  const sharing = await prisma.whatsAppAccount.count({
    where: { wabaId: account.wabaId, NOT: { id: account.id } },
  });
  if (sharing === 0) {
    try {
      await unsubscribeApp(account.wabaId, decryptSecret(account.accessTokenEnc));
    } catch (e) {
      console.warn("whatsapp unsubscribe failed", { branchId, error: String(e) });
    }
  }
  await prisma.whatsAppAccount.delete({ where: { id: account.id } });
  return NextResponse.json({ ok: true });
}
