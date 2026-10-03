import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getXrayCapability } from "@/lib/auth/xray";
import { prisma } from "@/lib/prisma";
import { analysePelvis, progressEvent, VisionApiError, type AnalysisProgress } from "@/lib/anthropic-vision";
import { retryAfterSeconds, takeToken, type BucketConfig } from "@/lib/booking/rate-limit";
import { aiUsageToday, dailyLimitReached, recordAiUsage } from "@/lib/ai-usage";
import { accountAccess } from "@/lib/subscription";
import type {
  DetectLandmarksDone,
  DetectLandmarksRejection,
  DetectLandmarksResponse,
  PelvisAnalysisView,
} from "@/types/pelvis";

/**
 * POST /api/viewer/detect-landmarks  { xrayId, view?: { rotation, flipV } }
 *
 * AI pelvic landmark detection (contract: `src/types/pelvis.ts`). Privacy
 * boundary: the client sends only an xrayId and the viewer's rotation and
 * vertical flip; we check access, fetch the bytes from R2 and hand
 * `analysePelvis` ONLY those bytes, the view, the image's recorded size and
 * the deadline. No xrayId, patient, branch, doctor or filename ever reaches
 * Anthropic.
 *
 * Time: the R2 fetch and the analysis share one budget (ANALYSIS_BUDGET_MS,
 * inside maxDuration) and one abort signal that also fires when the client
 * disconnects; then the request ends quietly (499, nobody is listening).
 *
 * 200 DetectLandmarksResponse · 422 DetectLandmarksRejection (NOT_SUITABLE)
 * · 504 TIMEOUT · 402 SUBSCRIPTION_REQUIRED · 429 DAILY_LIMIT / RATE_LIMITED
 * · otherwise { error, message }.
 *
 * Progress: with `Accept: application/x-ndjson`, once the checks pass the
 * answer is a 200 stream of DetectLandmarksProgress lines and one final
 * DetectLandmarksDone carrying the status and body the JSON answer would have.
 *
 * Daily limit: `User.aiDailyLimit` different X-rays per clinic day
 * (`src/lib/ai-usage.ts`), counted when an analysis places landmarks.
 */

export const runtime = "nodejs";
export const maxDuration = 120;
const ANALYSIS_BUDGET_MS = 105_000;

/** One analysis is up to 11 Opus calls (1 check + 3 detect + 7 refine): 6 per user per 10 minutes. */
const ANALYSIS_LIMIT: BucketConfig = { capacity: 6, refillPerSec: 6 / 600 };
const SUPPORTED: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VISION_STATUS: Record<VisionApiError["code"], number> = {
  image_too_large: 413,
  invalid_image: 422,
  rate_limited: 429,
  vision_api_error: 502,
  timeout: 504,
};
const ROTATIONS = [0, 90, 180, 270] as const;

function fail(status: number, error: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error, message }, { status, headers });
}

type Outcome = Omit<DetectLandmarksDone, "type">;

function failure(status: number, error: string, message: string): Outcome {
  return { status, body: { error, message } };
}

/** `view` from the body: omitted → upright as stored; null when malformed. */
function parseView(value: unknown): PelvisAnalysisView | null {
  if (value === undefined) return { rotation: 0, flipV: false };
  if (typeof value !== "object" || value === null) return null;
  const { rotation, flipV } = value as Record<string, unknown>;
  const r = ROTATIONS.find((a) => a === rotation);
  return r === undefined || typeof flipV !== "boolean" ? null : { rotation: r, flipV };
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return fail(401, "UNAUTHORIZED", "Sign-in required.");
  const userId = session.user.id;

  let body: { xrayId?: unknown; view?: unknown };
  try {
    body = (await request.json()) as { xrayId?: unknown; view?: unknown };
  } catch {
    return fail(400, "BAD_REQUEST", "Invalid JSON body.");
  }
  const { xrayId } = body;
  if (!xrayId || typeof xrayId !== "string") return fail(400, "BAD_REQUEST", "xrayId is required.");
  const view = parseView(body.view);
  if (!view) return fail(400, "BAD_REQUEST", "view must be { rotation: 0 | 90 | 180 | 270, flipV: boolean }.");

  // 404, not 403: don't leak the existence of an X-ray the user can't see.
  if (!(await getXrayCapability(userId, xrayId))) return fail(404, "NOT_FOUND", "X-ray not found.");

  const xray = await prisma.xray.findUnique({
    where: { id: xrayId },
    select: { status: true, fileUrl: true, mimeType: true, width: true, height: true },
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

  const access = await accountAccess(userId);
  if (!access?.allowed) {
    return fail(402, "SUBSCRIPTION_REQUIRED", "Your free trial has ended. Subscribe to SmartChiro Pro to keep using AI analysis.");
  }

  const usage = await aiUsageToday(userId);
  if (dailyLimitReached(usage, xrayId)) {
    return fail(
      429,
      "DAILY_LIMIT",
      `You've used today's AI analysis limit (${usage.limit} X-ray${usage.limit === 1 ? "" : "s"}). It resets at midnight.`,
    );
  }

  if (!takeToken(`pelvis-ai:${userId}`, ANALYSIS_LIMIT)) {
    const retryAfter = retryAfterSeconds(ANALYSIS_LIMIT);
    return fail(429, "RATE_LIMITED", `Too many AI analyses; try again in ${Math.ceil(retryAfter / 60)} minutes.`, {
      "Retry-After": String(retryAfter),
    });
  }

  const job = { ...xray, xrayId, userId, view, usage, signal: request.signal };
  if (!request.headers.get("accept")?.includes("application/x-ndjson")) {
    const outcome = await analyse(job, () => {});
    // The client disconnected: the response goes nowhere.
    if (!outcome) return new NextResponse(null, { status: 499 });
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: object) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          // Stream already closed: the client went away.
        }
      };
      const outcome = await analyse(job, (p) => send(progressEvent(p)));
      if (outcome) send({ type: "done", ...outcome } satisfies DetectLandmarksDone);
      try {
        controller.close();
      } catch {
        // Already closed.
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Fetch the film and run the analysis; null when the client went away. */
async function analyse(
  job: {
    fileUrl: string;
    width: number | null;
    height: number | null;
    xrayId: string;
    userId: string;
    view: PelvisAnalysisView;
    usage: Awaited<ReturnType<typeof aiUsageToday>>;
    signal: AbortSignal;
  },
  onProgress: (p: AnalysisProgress) => void,
): Promise<Outcome | null> {
  const deadlineMs = Date.now() + ANALYSIS_BUDGET_MS;
  const signal = AbortSignal.any([job.signal, AbortSignal.timeout(ANALYSIS_BUDGET_MS)]);

  onProgress({ stage: "load", done: 0, total: 1 });
  let imageBytes: Buffer;
  try {
    const image = await fetch(job.fileUrl, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
    if (!image.ok) throw new Error(`R2 responded ${image.status}`);
    imageBytes = Buffer.from(await image.arrayBuffer());
  } catch (err) {
    if (job.signal.aborted) return null;
    console.error("detect-landmarks R2 fetch failed:", err);
    return failure(502, "R2_FETCH_FAILED", "Failed to load X-ray image.");
  }
  onProgress({ stage: "load", done: 1, total: 1 });

  const storedSize = job.width && job.height ? { width: job.width, height: job.height } : null;
  try {
    const result = await analysePelvis({ imageBytes, view: job.view, storedSize, signal, deadlineMs, onProgress });
    if (result.kind === "rejected") {
      return {
        status: 422,
        body: {
          error: "NOT_SUITABLE",
          message: "This X-ray isn't suitable for AI pelvic analysis.",
          reasons: result.reasons,
          assessment: result.assessment,
        } satisfies DetectLandmarksRejection,
      };
    }
    const { landmarks, assessment, patientRightOn, sideSource, warnings, model } = result;
    const usage = await recordAiUsage(job.userId, job.xrayId, job.usage);
    return {
      status: 200,
      body: { landmarks, assessment, patientRightOn, sideSource, warnings, model, usage } satisfies DetectLandmarksResponse,
    };
  } catch (err) {
    if (job.signal.aborted) return null;
    if (err instanceof VisionApiError) {
      return failure(VISION_STATUS[err.code], err.code.toUpperCase(), err.message);
    }
    console.error("detect-landmarks unexpected error:", err);
    return failure(500, "INTERNAL_ERROR", "Unexpected server error.");
  }
}
