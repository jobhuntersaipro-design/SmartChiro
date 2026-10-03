import { describe, it, expect } from "vitest";
import { readDetectAnswer } from "../detect-landmarks-client";
import { progressEvent } from "../anthropic-vision";

function ndjson(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
}

describe("readDetectAnswer", () => {
  it("passes progress lines on and returns the final status and body, across chunk splits", async () => {
    const seen: number[] = [];
    const lines = [
      JSON.stringify(progressEvent({ stage: "load", done: 0, total: 1 })),
      JSON.stringify(progressEvent({ stage: "detect", done: 2, total: 3 })),
      JSON.stringify({ type: "done", status: 422, body: { error: "NOT_SUITABLE" } }),
    ].join("\n");
    const res = ndjson([lines.slice(0, 30), lines.slice(30, 95), lines.slice(95)]);
    const answer = await readDetectAnswer(res, (p) => seen.push(p.percent));
    expect(seen).toEqual([0, 56]);
    expect(answer).toEqual({ status: 422, body: { error: "NOT_SUITABLE" } });
  });

  it("returns plain JSON answers as they are", async () => {
    const res = new Response(JSON.stringify({ error: "DAILY_LIMIT" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
    expect(await readDetectAnswer(res, () => {})).toEqual({ status: 429, body: { error: "DAILY_LIMIT" } });
  });

  it("reports a stream that ends without a result", async () => {
    const answer = await readDetectAnswer(ndjson([JSON.stringify(progressEvent({ stage: "check", done: 0, total: 1 }))]), () => {});
    expect(answer.status).toBe(502);
  });
});

describe("progressEvent", () => {
  it("moves forward through the stages and never reaches 100", () => {
    const steps = [
      progressEvent({ stage: "load", done: 0, total: 1 }),
      progressEvent({ stage: "check", done: 1, total: 1 }),
      progressEvent({ stage: "detect", done: 3, total: 3 }),
      progressEvent({ stage: "refine", done: 7, total: 7 }),
    ];
    const percents = steps.map((s) => s.percent);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(steps.at(-1)!.percent).toBeLessThan(100);
    expect(steps.every((s) => s.ceiling >= s.percent)).toBe(true);
    expect(progressEvent({ stage: "refine", done: 0, total: 0 }).percent).toBe(70);
  });
});
