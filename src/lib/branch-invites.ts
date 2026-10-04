import type { BranchRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendBranchInviteEmail } from "@/lib/email";
import { can } from "@/lib/permissions";

/** Invites lapse after two weeks; re-inviting starts the clock again. */
export const INVITE_TTL_DAYS = 14;
const liveSince = (now: Date) => new Date(now.getTime() - INVITE_TTL_DAYS * 86_400_000);

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
    update: { role: args.role, invitedById: args.invitedBy.id, createdAt: new Date() },
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

export async function pendingInvites(userId: string, now: Date = new Date()) {
  const invites = await prisma.branchInvite.findMany({
    where: { userId, createdAt: { gte: liveSince(now) } },
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

/** A branch's open invites, for the people who manage its staff. */
export async function branchInvites(branchId: string, now: Date = new Date()) {
  const invites = await prisma.branchInvite.findMany({
    where: { branchId, createdAt: { gte: liveSince(now) } },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, createdAt: true, user: { select: { name: true, email: true } } },
  });
  return invites.map((i) => ({ id: i.id, role: i.role, name: i.user.name, email: i.user.email, sentAt: i.createdAt.toISOString() }));
}

/** Withdraw an invite to this branch. False when there's no such invite. */
export async function withdrawInvite(branchId: string, inviteId: string): Promise<boolean> {
  const { count } = await prisma.branchInvite.deleteMany({ where: { id: inviteId, branchId } });
  return count > 0;
}

/**
 * Accept (join the branch) or decline. False when the invite isn't theirs,
 * has lapsed, or whoever sent it no longer manages staff there (an admin
 * removed since can't leave a way back in).
 */
export async function answerInvite(userId: string, inviteId: string, accept: boolean, now: Date = new Date()): Promise<boolean> {
  const invite = await prisma.branchInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.userId !== userId) return false;
  const inviter = invite.invitedById
    ? await prisma.branchMember.findUnique({
        where: { userId_branchId: { userId: invite.invitedById, branchId: invite.branchId } },
        select: { role: true },
      })
    : null;
  if (accept && (invite.createdAt < liveSince(now) || !inviter || !can(inviter.role, "staff.manage"))) {
    await prisma.branchInvite.delete({ where: { id: invite.id } });
    return false;
  }
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
