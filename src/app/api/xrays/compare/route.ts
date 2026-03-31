import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/xrays/compare?ids={xrayId1},{xrayId2}
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");

    if (!idsParam) {
      return NextResponse.json(
        { error: "MISSING_IDS", message: "ids query parameter is required (comma-separated)." },
        { status: 400 }
      );
    }

    const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);

    if (ids.length !== 2) {
      return NextResponse.json(
        { error: "INVALID_IDS", message: "Exactly 2 X-ray IDs are required." },
        { status: 400 }
      );
    }

    const xrays = await prisma.xray.findMany({
      where: { id: { in: ids } },
      include: {
        annotations: {
          select: {
            id: true,
            label: true,
            version: true,
            thumbnailUrl: true,
            canvasStateSize: true,
            createdById: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (xrays.length !== 2) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "One or both X-rays not found." },
        { status: 404 }
      );
    }

    // Validate both belong to same patient
    if (xrays[0].patientId !== xrays[1].patientId) {
      return NextResponse.json(
        { error: "DIFFERENT_PATIENTS", message: "Both X-rays must belong to the same patient." },
        { status: 400 }
      );
    }

    // Validate both are READY
    for (const xray of xrays) {
      if (xray.status !== "READY") {
        return NextResponse.json(
          { error: "XRAY_NOT_READY", message: `X-ray ${xray.id} is not ready for comparison.` },
          { status: 400 }
        );
      }
    }

    // Structure response per spec
    const annotations: Record<string, typeof xrays[0]["annotations"]> = {};
    const xrayData = xrays.map((xray) => {
      const { annotations: annots, ...data } = xray;
      annotations[xray.id] = annots;
      return data;
    });

    return NextResponse.json({ xrays: xrayData, annotations });
  } catch (error) {
    console.error("Failed to compare xrays:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to load comparison." },
      { status: 500 }
    );
  }
}
