import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { branchInvites } from "@/lib/branch-invites";
import { can } from "@/lib/permissions";

/** GET: the branch's open invites (people who manage its staff only). */
export async function GET(_req: Request, { params }: { params: Promise<{ branchId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { branchId } = await params;
  const member = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId } },
    select: { role: true },
  });
  if (!member || !can(member.role, "staff.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ invites: await branchInvites(branchId) });
}
