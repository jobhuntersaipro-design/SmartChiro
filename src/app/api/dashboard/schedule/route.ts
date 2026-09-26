import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadTodaySchedule } from "@/lib/dashboard-home";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const branchId = new URL(req.url).searchParams.get("branchId");
  const appointments = await loadTodaySchedule({
    userId: session.user.id,
    branchRole: session.user.branchRole ?? null,
    branchId,
    activeBranchId: session.user.activeBranchId ?? null,
  });

  return NextResponse.json({ appointments });
}
