import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/xrays?patientId={id}&page={n}&limit={n}&status={status}
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("patientId");

    if (!patientId) {
      return NextResponse.json(
        { error: "MISSING_PATIENT_ID", message: "patientId query parameter is required." },
        { status: 400 }
      );
    }

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const status = searchParams.get("status") ?? "READY";

    // Validate status
    if (!["READY", "ARCHIVED", "UPLOADING"].includes(status)) {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "Status must be READY, ARCHIVED, or UPLOADING." },
        { status: 400 }
      );
    }

    const where = {
      patientId,
      status: status as "READY" | "ARCHIVED" | "UPLOADING",
    };

    const [xrays, total] = await Promise.all([
      prisma.xray.findMany({
        where,
        select: {
          id: true,
          title: true,
          bodyRegion: true,
          viewType: true,
          status: true,
          fileUrl: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          width: true,
          height: true,
          thumbnailUrl: true,
          isCalibrated: true,
          pixelSpacing: true,
          calibrationMethod: true,
          patientId: true,
          visitId: true,
          uploadedById: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.xray.count({ where }),
    ]);

    return NextResponse.json({ xrays, total, page, limit });
  } catch (error) {
    console.error("Failed to list xrays:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to list X-rays." },
      { status: 500 }
    );
  }
}
