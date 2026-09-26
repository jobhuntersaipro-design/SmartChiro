import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadBranches } from "@/lib/dashboard-home";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const branches = await loadBranches(session.user.id);
  return NextResponse.json({ branches });
}
