import type { BranchRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendBranchInviteEmail } from "@/lib/email";

/**
 * Invite an existing account to a branch. They join only when they accept
 * from their dashboard. Re-inviting updates the role. The email is best effort.
 */
export async function inviteExistingUser(args: {
  user: { id: string; email: string; name: string | null };
  branchId: string;
  role: BranchRole;
  invitedBy: { id: string; name: string | null };
}) {
  const invite = await prisma.branchInvite.upsert({
    where: { userId_branchId: { userId: args.user.id, branchId: args.branchId } },
    create: { userId: args.user.id, branchId: args.branchId, role: args.role, invitedById: args.invitedBy.id },
    update: { role: args.role, invitedById: args.invitedBy.id },
    include: { branch: { select: { name: true } } },
  });
  // Awaited (a serverless function may stop once it has answered); never throws.
  await sendBranchInviteEmail({
    to: args.user.email,
    name: args.user.name,
    branchName: invite.branch.name,
    inviterName: args.invitedBy.name,
    role: args.role,
  });
  return invite;
}

export async function pendingInvites(userId: string) {
  const invites = await prisma.branchInvite.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, branch: { select: { name: true } }, invitedById: true },
  });
  const inviterIds = [...new Set(invites.map((i) => i.invitedById).filter((id): id is string => !!id))];
  const inviters = inviterIds.length
    ? await prisma.user.findMany({ where: { id: { in: inviterIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(inviters.map((u) => [u.id, u.name]));
  return invites.map((i) => ({
    id: i.id,
    role: i.role,
    branchName: i.branch.name,
    invitedBy: i.invitedById ? names.get(i.invitedById) ?? null : null,
  }));
}

export type PendingInvite = Awaited<ReturnType<typeof pendingInvites>>[number];

/** Accept (join the branch) or decline. False when the invite isn't theirs. */
export async function answerInvite(userId: string, inviteId: string, accept: boolean): Promise<boolean> {
  const invite = await prisma.branchInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.userId !== userId) return false;
  await prisma.$transaction(async (tx) => {
    if (accept) {
      await tx.branchMember.upsert({
        where: { userId_branchId: { userId, branchId: invite.branchId } },
        create: { userId, branchId: invite.branchId, role: invite.role },
        update: {},
      });
    }
    await tx.branchInvite.delete({ where: { id: invite.id } });
  });
  return true;
}
