import { describe, it, expect, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import {
  analysePelvis,
  combineRuns,
  decideSuitability,
  orderViolations,
  sideFromMarker,
  VisionApiError,
  VISION_MODEL,
  type LandmarkPoints,
} from "@/lib/anthropic-vision";
import type { PelvisImageAssessment } from "@/types/pelvis";

/**
 * No network: every test injects a fake client that answers by pass
 * (effort low = assess, high = locate, medium = refine).
 *
 * Geometry used throughout: a 2000x1000 film is sent for assessment at
 * 1568x784. The model's pelvis box (392,196)-(1176,588) maps to
 * (500,250)-(1500,750); +6% gives the crop (440,220) 1120x560, sent at
 * 1568x784. Refine windows are 0.30 x 1120 = 336 px, sent at 941 px.
 */

type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
interface Reply {
  stop_reason?: string;
  json?: unknown;
}

function fakeClient(answer: (params: CreateParams) => Reply) {
  const calls: { params: CreateParams; options: unknown }[] = [];
  const create = vi.fn(async (params: CreateParams, options: unknown) => {
    calls.push({ params, options });
    const reply = answer(params);
    return {
      stop_reason: reply.stop_reason ?? "end_turn",
      content: reply.json === undefined ? [] : [{ type: "text", text: JSON.stringify(reply.json) }],
    };
  });
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, calls };
}

function textOf(params: CreateParams): string {
  const content = params.messages[0].content;
  if (typeof content === "string") return content;
  return content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
}

async function sentSize(params: CreateParams): Promise<string> {
  const content = params.messages[0].content;
  const image = typeof content === "string" ? undefined : content.find((b) => b.type === "image");
  if (image?.type !== "image" || image.source.type !== "base64") throw new Error("no image sent");
  const meta = await sharp(Buffer.from(image.source.data, "base64")).metadata();
  return `${meta.width}x${meta.height}`;
}

const effortOf = (params: CreateParams) => params.output_config?.effort;

const filmBytes = () =>
  sharp({ create: { width: 2000, height: 1000, channels: 3, background: { r: 90, g: 90, b: 90 } } })
    .png()
    .toBuffer();

function assessmentAnswer(overrides: Record<string, unknown> = {}) {
  return {
    isRadiograph: true,
    projection: "AP",
    region: "pelvis",
    visible: { iliacCrests: true, femoralHeads: true, ischialTuberosities: true, sacrum: true, pubicSymphysis: true },
    hipImplant: false,
    overlays: false,
    quality: "good",
    sideMarker: null,
    pelvisBox: { x0: 392, y0: 196, x1: 1176, y1: 588 },
    notes: "AP pelvis.",
    ...overrides,
  };
}

/** Where the fake model puts each landmark, as fractions of the crop (S2 order holds). */
const FRACTIONS: Record<number, [number, number]> = {
  1: [0.35, 0.62], 2: [0.65, 0.62], 3: [0.25, 0.1], 4: [0.4, 0.9],
  5: [0.75, 0.1], 6: [0.6, 0.9], 7: [0.5, 0.45], 8: [0.5, 0.75],
  9: [0.45, 0.3], 10: [0.55, 0.3], 11: [0.4, 0.45], 12: [0.6, 0.45],
  13: [0.45, 0.45], 14: [0.1, 0.4], 15: [0.55, 0.45], 16: [0.9, 0.4],
};
const CROP = { left: 440, top: 220, width: 1120, height: 560 };
const expected = (id: number) => ({
  x: CROP.left + FRACTIONS[id][0] * CROP.width,
  y: CROP.top + FRACTIONS[id][1] * CROP.height,
});

function locateAnswer(params: CreateParams, fractions = FRACTIONS) {
  const [, w, h] = textOf(params).match(/The image is (\d+)x(\d+) pixels/) ?? [];
  return {
    landmarks: Object.entries(fractions).map(([id, [fx, fy]]) => ({
      id: Number(id),
      x: fx * Number(w),
      y: fy * Number(h),
      confidence: 0.8,
    })),
  };
}

function refineAnswer(params: CreateParams, dx: number) {
  const [, cx, cy] = textOf(params).match(/magenta cross at \((\d+), (\d+)\)/) ?? [];
  return { x: Number(cx) + dx, y: Number(cy), confidence: 0.95 };
}

function pipeline(opts: { assessment?: Record<string, unknown>; refineDx?: number; fractions?: typeof FRACTIONS } = {}) {
  return fakeClient((params) => {
    const effort = effortOf(params);
    if (effort === "low") return { json: assessmentAnswer(opts.assessment) };
    if (effort === "high") return { json: locateAnswer(params, opts.fractions) };
    return { json: refineAnswer(params, opts.refineDx ?? 0) };
  });
}

async function accepted(client: Anthropic) {
  const result = await analysePelvis({ imageBytes: await filmBytes(), client });
  if (result.kind !== "accepted") throw new Error(`rejected: ${result.reasons.join(" ")}`);
  return result;
}

describe("request payload (privacy boundary)", () => {
  it("sends each pass only the image and the prompt, with no identifiers", async () => {
    const { client, calls } = pipeline();
    await accepted(client);

    expect(calls.length).toBe(1 + 3 + 7);
    for (const { params } of calls) {
      expect(Object.keys(params).sort()).toEqual(
        ["betas", "fallbacks", "max_tokens", "messages", "model", "output_config"],
      );
      expect(params.messages).toHaveLength(1);
      expect(params.messages[0].role).toBe("user");
      const content = params.messages[0].content;
      expect(typeof content === "string" ? [] : content.map((b) => b.type)).toEqual(["image", "text"]);

      const serialized = JSON.stringify(params, (k, v) => (k === "data" ? "[image]" : v));
      for (const token of ["xrayId", "patientId", "branchId", "uploadedById", "fileUrl", "fileName", "@", "920101"]) {
        expect(serialized, `payload contains "${token}"`).not.toContain(token);
      }
    }
  });

  it("uses Opus 5.5 with refusal fallback and structured output, without thinking overrides", async () => {
    const { client, calls } = pipeline();
    await accepted(client);

    expect(VISION_MODEL).toBe("claude-opus-5-5");
    for (const { params, options } of calls) {
      expect(params.model).toBe("claude-opus-5-5");
      expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
      expect(params.fallbacks).toBe("default");
      expect(params.max_tokens).toBe(16000);
      expect(params.output_config?.format?.type).toBe("json_schema");
      expect(params).not.toHaveProperty("thinking");
      expect(params).not.toHaveProperty("temperature");
      expect(options).toEqual({ timeout: 60_000, maxRetries: 1 });
    }
    expect(calls.map((c) => effortOf(c.params))).toEqual([
      "low", "high", "high", "high", "medium", "medium", "medium", "medium", "medium", "medium", "medium",
    ]);
  });

  it("tells the model the exact size of the image it was sent", async () => {
    const { client, calls } = pipeline();
    await accepted(client);

    for (const { params } of calls) {
      expect(textOf(params)).toContain(await sentSize(params));
    }
    expect(await sentSize(calls[0].params)).toBe("1568x784");
    expect(await sentSize(calls[1].params)).toBe("1568x784");
    expect(await sentSize(calls[4].params)).toBe("941x941");
  });

  it("draws the magenta cross where the refine prompt says it is", async () => {
    const { client, calls } = pipeline();
    await accepted(client);

    const refine = calls[4].params;
    const [, cx, cy] = textOf(refine).match(/magenta cross at \((\d+), (\d+)\)/) ?? [];
    const content = refine.messages[0].content;
    const image = typeof content === "string" ? undefined : content.find((b) => b.type === "image");
    if (image?.type !== "image" || image.source.type !== "base64") throw new Error("no image sent");
    const { data, info } = await sharp(Buffer.from(image.source.data, "base64"))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const [r, g, b] = pixel(Number(cx) - 8, Number(cy));
    expect(r - g).toBeGreaterThan(80);
    expect(b - g).toBeGreaterThan(80);
    // The gap leaves the point itself unmarked.
    const [r0, g0] = pixel(Number(cx), Number(cy));
    expect(Math.abs(r0 - g0)).toBeLessThan(30);
  });
});

function assessment(overrides: Partial<PelvisImageAssessment> = {}): PelvisImageAssessment {
  return {
    isRadiograph: true,
    projection: "AP",
    region: "pelvis",
    visible: { iliacCrests: true, femoralHeads: true, ischialTuberosities: true, sacrum: true, pubicSymphysis: true },
    hipImplant: false,
    overlays: false,
    quality: "good",
    sideMarker: null,
    pelvisBox: [500, 250, 1500, 750],
    notes: "",
    ...overrides,
  };
}

const NONE_VISIBLE = { iliacCrests: false, femoralHeads: false, ischialTuberosities: false, sacrum: false, pubicSymphysis: false };

describe("decideSuitability", () => {
  it("accepts a clean AP pelvis", () => {
    expect(decideSuitability(assessment())).toEqual({ suitable: true, reasons: [], warnings: [] });
  });

  it.each<[string, Partial<PelvisImageAssessment>, string]>([
    ["a lateral view", { projection: "lateral" }, "This looks like a lateral view; the analysis needs an AP (front-to-back) view of the pelvis."],
    ["a chest film", { region: "chest", visible: NONE_VISIBLE, pelvisBox: null }, "The pelvis isn't in this image; the analysis needs the region from the iliac crests to the femoral heads."],
    ["a hip implant", { hipImplant: true }, "A hip implant is present; the paper's method excludes films with implants."],
    ["a non-radiograph", { isRadiograph: false }, "This doesn't look like an X-ray."],
    ["missing femoral heads", { visible: { ...assessment().visible, femoralHeads: false } }, "The femoral heads are not fully in the image."],
    ["poor quality", { quality: "poor" }, "The image quality is too poor to trace the bone outlines."],
    ["no pelvis box", { pelvisBox: null }, "The pelvis couldn't be located in the image."],
    ["an unknown projection", { projection: "unknown" }, "The view couldn't be confirmed as AP; the analysis needs an AP (front-to-back) view of the pelvis."],
  ])("rejects %s", (_name, overrides, reason) => {
    const verdict = decideSuitability(assessment(overrides));
    expect(verdict.suitable).toBe(false);
    expect(verdict.reasons).toContain(reason);
  });

  it("gives a non-radiograph a single reason", () => {
    expect(decideSuitability(assessment({ isRadiograph: false, projection: "other", visible: NONE_VISIBLE })).reasons).toEqual([
      "This doesn't look like an X-ray.",
    ]);
  });

  it("accepts an AP full-spine film with the ischial tuberosities cut off, with an IM warning", () => {
    const verdict = decideSuitability(
      assessment({ region: "full_spine", visible: { ...assessment().visible, ischialTuberosities: false } }),
    );
    expect(verdict.suitable).toBe(true);
    expect(verdict.warnings).toEqual(["The ischial tuberosities are outside the film, so IM can't be measured."]);
  });

  it("warns about overlays and fair quality, and accepts PA", () => {
    const verdict = decideSuitability(assessment({ projection: "PA", overlays: true, quality: "fair" }));
    expect(verdict.suitable).toBe(true);
    expect(verdict.warnings).toEqual([
      "The film already has marks drawn on it; check each landmark.",
      "Image quality is fair; check each landmark.",
    ]);
  });
});

describe("sideFromMarker", () => {
  it.each<[PelvisImageAssessment["sideMarker"], "left" | "right", "marker" | "assumed"]>([
    [{ letter: "R", imageSide: "left" }, "left", "marker"],
    [{ letter: "L", imageSide: "left" }, "right", "marker"],
    [{ letter: "R", imageSide: "right" }, "right", "marker"],
    [{ letter: "L", imageSide: "right" }, "left", "marker"],
    [null, "left", "assumed"],
  ])("%o → patient right on image %s (%s)", (marker, patientRightOn, sideSource) => {
    expect(sideFromMarker(marker)).toEqual({ patientRightOn, sideSource });
  });
});

describe("combineRuns", () => {
  it("takes per-axis medians and lowers confidence by the spread between runs", () => {
    const runs: LandmarkPoints[] = [
      new Map([[7, { x: 100, y: 100, confidence: 0.9 }], [8, { x: 50, y: 50, confidence: 0.7 }]]),
      new Map([[7, { x: 110, y: 100, confidence: 0.9 }]]),
      new Map([[7, { x: 104, y: 103, confidence: 0.6 }]]),
    ];
    const out = combineRuns(runs, 1000);
    // Median (104, 100); furthest run is 6 px away; limit 0.03 × 1000 = 30 px.
    expect(out.get(7)?.x).toBe(104);
    expect(out.get(7)?.y).toBe(100);
    expect(out.get(7)?.confidence).toBeCloseTo(0.8 * (1 - 6 / 30), 10);
    // Returned by one run only: its own point and confidence.
    expect(out.get(8)).toEqual({ x: 50, y: 50, confidence: 0.7 });
  });

  it("never drops confidence below 0.05", () => {
    const runs: LandmarkPoints[] = [
      new Map([[1, { x: 0, y: 0, confidence: 0.9 }]]),
      new Map([[1, { x: 100, y: 0, confidence: 0.9 }]]),
    ];
    expect(combineRuns(runs, 1000).get(1)?.confidence).toBe(0.05);
  });
});

describe("orderViolations", () => {
  const xs = (entries: [number, number][]) => new Map(entries.map(([id, x]) => [id, { x }]));

  it("is empty when 14 < 11 < 13 < 7 < 15 < 12 < 16", () => {
    expect(orderViolations(xs([[14, 1], [11, 2], [13, 3], [7, 4], [15, 5], [12, 6], [16, 7]])).size).toBe(0);
  });

  it("flags both landmarks of a swapped adjacent pair", () => {
    expect([...orderViolations(xs([[14, 1], [11, 2], [13, 5], [7, 4], [15, 6], [12, 7], [16, 8]]))].sort()).toEqual([13, 7].sort());
  });

  it("compares across missing landmarks", () => {
    expect([...orderViolations(xs([[11, 5], [7, 4], [16, 9]]))].sort()).toEqual([11, 7].sort());
  });
});

describe("analysePelvis", () => {
  it("maps crop-pass landmarks back to original pixels", async () => {
    const { client } = pipeline();
    const result = await accepted(client);

    expect(result.assessment.pelvisBox).toEqual([500, 250, 1500, 750]);
    expect(result.landmarks.map((l) => l.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    for (const l of result.landmarks) {
      expect(l.x).toBeCloseTo(expected(l.id).x, 0);
      expect(l.y).toBeCloseTo(expected(l.id).y, 0);
    }
    expect(result.landmarks[0].key).toBe("femoral_head_top_img_left");
    // Unrefined: the runs' confidence. Refined: max(0.8, 0.95 × 0.9).
    expect(result.landmarks.find((l) => l.id === 7)?.confidence).toBeCloseTo(0.8, 10);
    expect(result.landmarks.find((l) => l.id === 1)?.confidence).toBeCloseTo(0.855, 10);
    expect(result).toMatchObject({ patientRightOn: "left", sideSource: "assumed", warnings: [], model: VISION_MODEL });
  });

  it("moves a refined landmark by the zoomed answer, mapped back from the zoom window", async () => {
    const { client } = pipeline({ refineDx: 28 });
    const result = await accepted(client);
    // 28 px in the 941-px view of a 336-px window = 10 original px.
    expect(result.landmarks.find((l) => l.id === 1)?.x).toBeCloseTo(expected(1).x + (28 * 336) / 941, 0);
    expect(result.landmarks.find((l) => l.id === 7)?.x).toBeCloseTo(expected(7).x, 6);
  });

  it("keeps the first estimate when the zoomed answer jumps too far", async () => {
    const { client } = pipeline({ refineDx: 400 });
    const result = await accepted(client);
    const femoralHead = result.landmarks.find((l) => l.id === 1);
    expect(femoralHead?.x).toBeCloseTo(expected(1).x, 6);
    expect(femoralHead?.confidence).toBeCloseTo(0.8, 10);
  });

  it("halves the confidence of landmarks out of S2 order", async () => {
    const { client } = pipeline({ fractions: { ...FRACTIONS, 13: [0.5, 0.45], 7: [0.45, 0.45] } });
    const result = await accepted(client);
    expect(result.landmarks.find((l) => l.id === 13)?.confidence).toBeCloseTo(0.4, 10);
    expect(result.landmarks.find((l) => l.id === 7)?.confidence).toBeCloseTo(0.4, 10);
    expect(result.landmarks.find((l) => l.id === 11)?.confidence).toBeCloseTo(0.8, 10);
  });

  it("rejects an unsuitable film after the first pass", async () => {
    const { client, calls } = pipeline({ assessment: { projection: "lateral" } });
    const result = await analysePelvis({ imageBytes: await filmBytes(), client });
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.reasons).toContain(
        "This looks like a lateral view; the analysis needs an AP (front-to-back) view of the pelvis.",
      );
    }
    expect(calls).toHaveLength(1);
  });

  it("drops the ischial tuberosities when they are off the film", async () => {
    const { client, calls } = pipeline({
      assessment: {
        region: "full_spine",
        visible: { iliacCrests: true, femoralHeads: true, ischialTuberosities: false, sacrum: true, pubicSymphysis: true },
      },
    });
    const result = await accepted(client);
    expect(result.landmarks.map((l) => l.id)).not.toContain(4);
    expect(result.landmarks.map((l) => l.id)).not.toContain(6);
    expect(result.landmarks).toHaveLength(14);
    expect(result.warnings).toContain("The ischial tuberosities are outside the film, so IM can't be measured.");
    expect(calls.filter((c) => effortOf(c.params) === "medium")).toHaveLength(5);
  });

  it("takes the patient's side from the marker", async () => {
    const { client } = pipeline({ assessment: { sideMarker: { letter: "R", imageSide: "right" } } });
    expect(await accepted(client)).toMatchObject({ patientRightOn: "right", sideSource: "marker" });
  });

  it("tolerates one failed locate run", async () => {
    let locateCalls = 0;
    const { client } = fakeClient((params) => {
      const effort = effortOf(params);
      if (effort === "low") return { json: assessmentAnswer() };
      if (effort === "high") return ++locateCalls === 1 ? { stop_reason: "refusal" } : { json: locateAnswer(params) };
      return { json: refineAnswer(params, 0) };
    });
    expect((await accepted(client)).landmarks).toHaveLength(16);
  });

  it("fails when two of three locate runs fail", async () => {
    let locateCalls = 0;
    const { client } = fakeClient((params) => {
      const effort = effortOf(params);
      if (effort === "low") return { json: assessmentAnswer() };
      if (effort === "high") return ++locateCalls <= 2 ? { stop_reason: "refusal" } : { json: locateAnswer(params) };
      return { json: refineAnswer(params, 0) };
    });
    await expect(analysePelvis({ imageBytes: await filmBytes(), client })).rejects.toMatchObject({
      name: "VisionApiError",
      code: "vision_api_error",
    });
  });

  it("turns a refusal into a VisionApiError", async () => {
    const { client } = fakeClient(() => ({ stop_reason: "refusal" }));
    const err = await analysePelvis({ imageBytes: await filmBytes(), client }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VisionApiError);
    expect(err).toMatchObject({ code: "vision_api_error", message: expect.stringMatching(/declined/) });
  });

  it("turns a truncated answer into a VisionApiError", async () => {
    const { client } = fakeClient(() => ({ stop_reason: "max_tokens", json: {} }));
    await expect(analysePelvis({ imageBytes: await filmBytes(), client })).rejects.toMatchObject({
      code: "vision_api_error",
    });
  });

  it("maps an Anthropic rate limit to rate_limited", async () => {
    const { client } = fakeClient(() => {
      throw new Anthropic.RateLimitError(429, undefined, "slow down", new Headers());
    });
    await expect(analysePelvis({ imageBytes: await filmBytes(), client })).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("rejects unreadable bytes without calling the model", async () => {
    const { client, calls } = pipeline();
    await expect(
      analysePelvis({ imageBytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), client }),
    ).rejects.toMatchObject({ code: "invalid_image" });
    expect(calls).toHaveLength(0);
  });

  it("rejects absurdly large images without calling the model", async () => {
    const { client, calls } = pipeline();
    const huge = await sharp({ create: { width: 16385, height: 1, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(analysePelvis({ imageBytes: huge, client })).rejects.toMatchObject({ code: "image_too_large" });
    expect(calls).toHaveLength(0);
  });
});
