import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadDoctorStats, loadOwnerStats } from "@/lib/dashboard-home";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const branchId = new URL(req.url).searchParams.get("branchId");
  if (session.user.branchRole === "DOCTOR") {
    const stats = await loadDoctorStats(session.user.id, session.user.activeBranchId ?? null);
    return NextResponse.json(stats);
  }

  const stats = await loadOwnerStats(session.user.id, branchId);
  return NextResponse.json(stats);
}
