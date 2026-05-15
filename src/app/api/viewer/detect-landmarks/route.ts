import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { getXrayCapability } from "@/lib/auth/xray";
import { prisma } from "@/lib/prisma";
import {
  detectLandmarks,
  VisionApiError,
  type SupportedMediaType,
  type Landmark,
} from "@/lib/anthropic-vision";
import { applyBiasCorrection } from "@/lib/landmark-bias-correction";

/**
 * POST /api/viewer/detect-landmarks
 *
 * Privacy boundary route. The client passes only an `xrayId` (and optionally
 * a `cropBox` describing the visible viewport in image coordinates); the
 * server:
 *   1. Auth: requester must have access to the X-ray (canViewXray).
 *   2. R2: fetch the image bytes server-side.
 *   3. If a cropBox is supplied, extract that region with sharp so Claude
 *      sees a tighter, higher-detail view (sending the visible viewport
 *      means each anatomical structure occupies more pixels in the prompt
 *      image, which improves placement accuracy).
 *   4. Anthropic: call Claude vision with the image bytes ONLY — no xrayId,
 *      no patient id, no name, no IC, no branch, no doctor, no filename, no
 *      DB-resolvable identifier. The X-ray ID never leaves our server.
 *   5. If a crop was applied, translate Claude's coordinates back to the
 *      ORIGINAL image's coordinate system before returning. The client
 *      always works in original-image coords; the crop is invisible to it.
 *
 * The pure helper at `src/lib/anthropic-vision.ts` enforces the boundary by
 * type — its function signature accepts pixels only.
 */

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DetectLandmarksRequest {
  xrayId: string;
  /**
   * When present, only this rectangle (in original-image pixel coords) is
   * sent to Claude. Coordinates are clamped to the image bounds on the
   * server before use; the client may send fractional values from its
   * viewport math without rounding.
   */
  cropBox?: CropBox;
}

/**
 * Clamp + round a client-supplied cropBox into a safe extract rectangle.
 * Returns null when the box is degenerate (zero area, fully outside the
 * image, or malformed) — caller falls back to the full image in that case.
 */
function normalizeCropBox(
  raw: unknown,
  imageWidth: number,
  imageHeight: number,
): { left: number; top: number; width: number; height: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Partial<Record<keyof CropBox, unknown>>;
  if (
    typeof b.x !== "number" ||
    typeof b.y !== "number" ||
    typeof b.width !== "number" ||
    typeof b.height !== "number"
  ) {
    return null;
  }
  if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return null;
  if (!Number.isFinite(b.width) || !Number.isFinite(b.height)) return null;

  const left = Math.max(0, Math.floor(b.x));
  const top = Math.max(0, Math.floor(b.y));
  const right = Math.min(imageWidth, Math.ceil(b.x + b.width));
  const bottom = Math.min(imageHeight, Math.ceil(b.y + b.height));
  const width = right - left;
  const height = bottom - top;

  // Tiny crops (< 64 px on either side) probably indicate a wildly zoomed-in
  // user — give up on cropping and send the full image so Claude has the
  // context it needs to identify pelvic anatomy at all.
  if (width < 64 || height < 64) return null;
  return { left, top, width, height };
}

const SUPPORTED: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Sign-in required." },
      { status: 401 },
    );
  }

  let body: DetectLandmarksRequest;
  try {
    body = (await request.json()) as DetectLandmarksRequest;
  } catch {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Invalid JSON body." },
      { status: 400 },
    );
  }
  if (!body.xrayId || typeof body.xrayId !== "string") {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "xrayId is required." },
      { status: 400 },
    );
  }

  if (!(await getXrayCapability(session.user.id, body.xrayId))) {
    // 404 to avoid leaking the existence of an X-ray the user can't see.
    return NextResponse.json(
      { error: "NOT_FOUND", message: "X-ray not found." },
      { status: 404 },
    );
  }

  const xray = await prisma.xray.findUnique({
    where: { id: body.xrayId },
    select: { fileUrl: true, mimeType: true, width: true, height: true },
  });
  if (!xray) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "X-ray not found." },
      { status: 404 },
    );
  }
  if (!SUPPORTED.has(xray.mimeType)) {
    return NextResponse.json(
      {
        error: "UNSUPPORTED_MEDIA_TYPE",
        message: `mimeType ${xray.mimeType} is not supported by the vision API.`,
      },
      { status: 415 },
    );
  }
  if (!xray.width || !xray.height) {
    return NextResponse.json(
      {
        error: "MISSING_DIMENSIONS",
        message: "X-ray dimensions are missing; re-upload to populate them.",
      },
      { status: 422 },
    );
  }

  // Fetch image bytes from R2.
  const imageResponse = await fetch(xray.fileUrl);
  if (!imageResponse.ok) {
    return NextResponse.json(
      { error: "R2_FETCH_FAILED", message: "Failed to load X-ray image." },
      { status: 502 },
    );
  }
  let imageBytes = Buffer.from(await imageResponse.arrayBuffer());
  let mediaType = xray.mimeType as SupportedMediaType;
  let visionWidth = xray.width;
  let visionHeight = xray.height;
  let cropOffset: { left: number; top: number } | null = null;

  const crop = normalizeCropBox(body.cropBox, xray.width, xray.height);
  if (crop) {
    try {
      // Extract the visible viewport so Claude sees a tighter view. The
      // output is always JPEG for size; preprocessForVision will normalize
      // it downstream anyway. We capture the offset so we can map Claude's
      // coordinates back into the original image space before responding.
      const cropped = await sharp(imageBytes, { failOn: "none" })
        .extract({
          left: crop.left,
          top: crop.top,
          width: crop.width,
          height: crop.height,
        })
        .jpeg({ quality: 92 })
        .toBuffer();
      // Re-wrap to satisfy the strict `Buffer<ArrayBuffer>` typing the
      // downstream `imageBytes` variable was assigned from.
      imageBytes = Buffer.from(cropped);
      mediaType = "image/jpeg";
      visionWidth = crop.width;
      visionHeight = crop.height;
      cropOffset = { left: crop.left, top: crop.top };
    } catch (err) {
      // Cropping failed (corrupt image, sharp can't decode, etc.) — fall
      // through with the full image so the request still has a chance to
      // succeed. Worse accuracy is better than a hard error.
      console.error("detect-landmarks crop failed:", err);
    }
  }

  // Call Anthropic with image bytes only — no patient context.
  try {
    const landmarks = await detectLandmarks({
      imageBytes,
      mediaType,
      imageWidth: visionWidth,
      imageHeight: visionHeight,
    });
    // Translate crop-space coords back into original-image space before
    // handing them to the client, which always works in the original frame.
    let translated: Landmark[] = cropOffset
      ? landmarks.map((l) => ({
          ...l,
          x: l.x + cropOffset!.left,
          y: l.y + cropOffset!.top,
        }))
      : landmarks.map((l) => ({ ...l }));

    // Bias correction — read every user-saved correction for the landmarks
    // Claude returned and apply the median normalized delta. This is the
    // payoff for the AiLandmarkCorrection capture pipeline: each new save
    // makes the next detection slightly better. Pass `?raw=1` on the URL to
    // skip correction entirely (useful for A/B comparison).
    const rawMode = request.nextUrl.searchParams.get("raw") === "1";
    let biasApplied = 0;
    if (!rawMode && translated.length > 0) {
      try {
        const names = Array.from(new Set(translated.map((l) => l.name)));
        const corrections = await prisma.aiLandmarkCorrection.findMany({
          where: { landmarkName: { in: names } },
          select: {
            landmarkName: true,
            aiX: true,
            aiY: true,
            finalX: true,
            finalY: true,
            imageWidth: true,
            imageHeight: true,
          },
        });
        if (corrections.length > 0) {
          const before = translated.map((l) => ({ name: l.name, x: l.x, y: l.y }));
          translated = applyBiasCorrection(
            translated,
            corrections,
            xray.width,
            xray.height,
          );
          biasApplied = translated.reduce(
            (n, lm, i) =>
              n + (lm.x !== before[i].x || lm.y !== before[i].y ? 1 : 0),
            0,
          );
        }
      } catch (err) {
        // Fail-soft: if the correction lookup blows up, we still return
        // Claude's raw output rather than the whole request failing.
        console.error("bias-correction lookup failed (fail-soft):", err);
      }
    }

    return NextResponse.json({
      landmarks: translated,
      meta: { biasApplied, rawMode },
    });
  } catch (err) {
    if (err instanceof VisionApiError) {
      const status =
        err.code === "image_too_large" ? 413 : err.code === "rate_limited" ? 429 : 502;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    console.error("detect-landmarks unexpected error:", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Unexpected server error." },
      { status: 500 },
    );
  }
}
