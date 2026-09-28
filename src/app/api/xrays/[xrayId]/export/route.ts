import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageXray } from "@/lib/auth/xray";
import { exportXray, parseExportOptions, INVALID_FORMAT_RESPONSE } from "@/lib/xray-export";
import { createEmptyCanvasState } from "@/types/annotation";

type RouteParams = { params: Promise<{ xrayId: string }> };

// POST /api/xrays/{xrayId}/export — export a film that has no annotation yet
// (nothing drawn or adjusted, so no Annotation row exists to export from).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { xrayId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!(await canManageXray(session.user.id, xrayId))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const options = parseExportOptions(await request.json());
    if (!options) {
      return NextResponse.json(INVALID_FORMAT_RESPONSE, { status: 400 });
    }
    return await exportXray(xrayId, createEmptyCanvasState(), null, options);
  } catch (error) {
    console.error("Export failed:", error);
    return NextResponse.json(
      { error: "EXPORT_FAILED", message: "Export failed. Please try again." },
      { status: 500 }
    );
  }
}
