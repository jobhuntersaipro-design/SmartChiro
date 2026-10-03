import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getXrayCapability } from "@/lib/auth/xray";
import { prisma } from "@/lib/prisma";
import { analysePelvis, VisionApiError } from "@/lib/anthropic-vision";
import { retryAfterSeconds, takeToken, type BucketConfig } from "@/lib/booking/rate-limit";
import type { DetectLandmarksRejection, DetectLandmarksResponse } from "@/types/pelvis";

/**
 * POST /api/viewer/detect-landmarks  { xrayId }
 *
 * AI pelvic landmark detection (contract: `src/types/pelvis.ts`). Privacy
 * boundary: the client sends only an xrayId; we check access, fetch the
 * bytes from R2 and hand ONLY those bytes to `analysePelvis`. No xrayId,
 * patient, branch, doctor or filename ever reaches Anthropic.
 *
 * 200 DetectLandmarksResponse · 422 DetectLandmarksRejection (NOT_SUITABLE)
 * · otherwise { error, message }.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

/** One analysis is up to 11 Opus calls (1 check + 3 detect + 7 refine): 6 per user per 10 minutes. */
const ANALYSIS_LIMIT: BucketConfig = { capacity: 6, refillPerSec: 6 / 600 };
const SUPPORTED: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VISION_STATUS: Record<VisionApiError["code"], number> = {
  image_too_large: 413,
  invalid_image: 422,
  rate_limited: 429,
  vision_api_error: 502,
};

function fail(status: number, error: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error, message }, { status, headers });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return fail(401, "UNAUTHORIZED", "Sign-in required.");
  const userId = session.user.id;

  let xrayId: unknown;
  try {
    xrayId = ((await request.json()) as { xrayId?: unknown }).xrayId;
  } catch {
    return fail(400, "BAD_REQUEST", "Invalid JSON body.");
  }
  if (!xrayId || typeof xrayId !== "string") return fail(400, "BAD_REQUEST", "xrayId is required.");

  // 404, not 403: don't leak the existence of an X-ray the user can't see.
  if (!(await getXrayCapability(userId, xrayId))) return fail(404, "NOT_FOUND", "X-ray not found.");

  const xray = await prisma.xray.findUnique({
    where: { id: xrayId },
    select: { status: true, fileUrl: true, mimeType: true },
  });
  if (!xray) return fail(404, "NOT_FOUND", "X-ray not found.");
  if (!SUPPORTED.has(xray.mimeType)) {
    return fail(415, "UNSUPPORTED_MEDIA_TYPE", `mimeType ${xray.mimeType} is not supported by the vision API.`);
  }
  if (xray.status !== "READY" || !xray.fileUrl) {
    return fail(409, "XRAY_NOT_READY", "This X-ray isn't ready for analysis yet.");
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return fail(503, "AI_NOT_CONFIGURED", "AI analysis isn't set up on this server yet (ANTHROPIC_API_KEY is missing).");
  }

  if (!takeToken(`pelvis-ai:${userId}`, ANALYSIS_LIMIT)) {
    const retryAfter = retryAfterSeconds(ANALYSIS_LIMIT);
    return fail(429, "RATE_LIMITED", `Too many AI analyses; try again in ${Math.ceil(retryAfter / 60)} minutes.`, {
      "Retry-After": String(retryAfter),
    });
  }

  let imageBytes: Buffer;
  try {
    const image = await fetch(xray.fileUrl, { signal: AbortSignal.timeout(20_000) });
    if (!image.ok) throw new Error(`R2 responded ${image.status}`);
    imageBytes = Buffer.from(await image.arrayBuffer());
  } catch (err) {
    console.error("detect-landmarks R2 fetch failed:", err);
    return fail(502, "R2_FETCH_FAILED", "Failed to load X-ray image.");
  }

  try {
    const result = await analysePelvis({ imageBytes });
    if (result.kind === "rejected") {
      return NextResponse.json(
        {
          error: "NOT_SUITABLE",
          message: "This X-ray isn't suitable for AI pelvic analysis.",
          reasons: result.reasons,
          assessment: result.assessment,
        } satisfies DetectLandmarksRejection,
        { status: 422 },
      );
    }
    const { landmarks, assessment, patientRightOn, sideSource, warnings, model } = result;
    return NextResponse.json({
      landmarks,
      assessment,
      patientRightOn,
      sideSource,
      warnings,
      model,
    } satisfies DetectLandmarksResponse);
  } catch (err) {
    if (err instanceof VisionApiError) {
      return fail(VISION_STATUS[err.code], err.code.toUpperCase(), err.message);
    }
    console.error("detect-landmarks unexpected error:", err);
    return fail(500, "INTERNAL_ERROR", "Unexpected server error.");
  }
}
