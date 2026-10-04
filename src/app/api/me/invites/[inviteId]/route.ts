import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { answerInvite } from "@/lib/branch-invites";

/** Body `{ accept: boolean }`. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ inviteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.accept !== "boolean") return NextResponse.json({ error: "accept must be true or false" }, { status: 400 });
  const { inviteId } = await params;
  if (!(await answerInvite(session.user.id, inviteId, body.accept))) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
