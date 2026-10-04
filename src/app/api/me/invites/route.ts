import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pendingInvites } from "@/lib/branch-invites";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ invites: await pendingInvites(session.user.id) });
}
