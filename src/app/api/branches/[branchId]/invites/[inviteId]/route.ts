import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withdrawInvite } from "@/lib/branch-invites";
import { can } from "@/lib/permissions";
import { paywall } from "@/lib/paywall";

/** DELETE: withdraw an invite (people who manage the branch's staff). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ branchId: string; inviteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await paywall(session.user.id);
  if (blocked) return blocked;
  const { branchId, inviteId } = await params;
  const member = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId } },
    select: { role: true },
  });
  if (!member || !can(member.role, "staff.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await withdrawInvite(branchId, inviteId))) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
