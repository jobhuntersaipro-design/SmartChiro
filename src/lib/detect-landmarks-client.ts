import type { DetectLandmarksDone, DetectLandmarksProgress } from "@/types/pelvis";

/**
 * Read a POST /api/viewer/detect-landmarks answer sent with
 * `Accept: application/x-ndjson`: progress lines go to `onProgress`, and the
 * final status and body come back. Answers that never got as far as the
 * analysis (401, 404, 429…) are plain JSON and come back as they are.
 */
export async function readDetectAnswer(
  res: Response,
  onProgress: (p: DetectLandmarksProgress) => void,
): Promise<{ status: number; body: unknown }> {
  if (!res.headers.get("content-type")?.includes("application/x-ndjson") || !res.body) {
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  let done: DetectLandmarksDone | null = null;
  const take = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as DetectLandmarksProgress | DetectLandmarksDone;
    if (event.type === "progress") onProgress(event);
    else done = event;
  };
  for (;;) {
    const { value, done: ended } = await reader.read();
    if (ended) break;
    buffered += value;
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    lines.forEach(take);
  }
  take(buffered);
  const result = done as DetectLandmarksDone | null;
  if (!result) return { status: 502, body: { error: "INCOMPLETE", message: "The analysis stopped before it finished." } };
  return { status: result.status, body: result.body };
}
