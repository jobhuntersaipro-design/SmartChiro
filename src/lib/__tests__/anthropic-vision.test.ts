import { describe, it, expect, vi } from "vitest";
import {
  detectLandmarks,
  stripLaterality,
  VisionApiError,
  type SupportedMediaType,
} from "@/lib/anthropic-vision";

/**
 * The privacy boundary for AI landmark detection lives at this function's
 * signature: it accepts only `imageBytes`, `mediaType`, and dimensions. By
 * construction it cannot leak xrayId, patientId, names, IC, branch, or any
 * DB-resolvable identifier — there is no field where they could be passed.
 *
 * These tests assert that property holds end-to-end: capture the actual
 * payload sent to Anthropic, then scan it for known-PII strings. Any
 * regression that smuggles patient context into the prompt or system message
 * via a future code change should fail this test.
 */

function makeMockClient(stubResponse: { content: Array<{ type: "text"; text: string }> }) {
  const seen: { create?: Parameters<typeof create>[0] } = {};
  const create = vi.fn(async (params: unknown) => {
    seen.create = params as never;
    return stubResponse;
  });
  return {
    client: { messages: { create } } as unknown as Parameters<typeof detectLandmarks>[0]["client"],
    seen,
  };
}

const MINIMAL_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic header

describe("detectLandmarks (privacy regression)", () => {
  it("never sends patient identifiers in the request payload", async () => {
    const stub = {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify([
            { name: "top_of_left_femoral_head", displayName: "L femoral head", x: 100, y: 200, confidence: 0.8 },
          ]),
        },
      ],
    };
    const { client, seen } = makeMockClient(stub);

    await detectLandmarks({
      imageBytes: MINIMAL_BYTES,
      mediaType: "image/jpeg" as SupportedMediaType,
      imageWidth: 1024,
      imageHeight: 768,
      client,
      preprocess: false,
    });

    // Stringify the entire request to scan every field at once.
    const payload = JSON.stringify(seen.create);

    // Known-PII tokens that must never appear in a request.
    const FORBIDDEN = [
      "xray_",       // xray IDs use the cuid prefix elsewhere; this is also a substring of any DB id pattern
      "patient_",    // patient IDs
      "branch_",     // branch IDs
      "user_",       // user IDs
      "@",           // emails
      "920101",      // a fragment that would appear in a Malaysian IC
      "Lim",         // sample patient name fragment
      "fileName",    // R2 metadata key
      "fileUrl",     // R2 url field
      "uploadedById",
      "patientId",
      "branchId",
    ];
    for (const token of FORBIDDEN) {
      expect(payload, `payload contains forbidden token "${token}"`).not.toContain(token);
    }
  });

  it("sends only the image + prompt + system content, nothing else identifying", async () => {
    const { client, seen } = makeMockClient({ content: [{ type: "text", text: "[]" }] });
    await detectLandmarks({
      imageBytes: MINIMAL_BYTES,
      mediaType: "image/jpeg",
      imageWidth: 1024,
      imageHeight: 768,
      client,
      preprocess: false,
    });

    const params = seen.create as unknown as {
      model: string;
      messages: Array<{ role: string; content: Array<{ type: string }> }>;
      system: string;
    };

    expect(params.model).toBe("claude-opus-4-7");
     expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe("user");
    // Each user message has exactly two content blocks: image + text prompt.
    const types = params.messages[0].content.map((c) => c.type).sort();
    expect(types).toEqual(["image", "text"]);
    // System prompt is the medical-imaging-assistant scaffold — the prompt
    // text itself is fixed and contains no patient context. (We just check
    // it's present and a string.)
    expect(typeof params.system).toBe("string");
    expect(params.system.length).toBeGreaterThan(0);
  });

  it("rejects images larger than 8MB before calling Anthropic", async () => {
    const { client, seen } = makeMockClient({ content: [{ type: "text", text: "[]" }] });
    const tooBig = Buffer.alloc(9 * 1024 * 1024);
    await expect(
      detectLandmarks({
        imageBytes: tooBig,
        mediaType: "image/jpeg",
        imageWidth: 1024,
        imageHeight: 768,
        client,
      preprocess: false,
      }),
    ).rejects.toThrow(VisionApiError);
    expect(seen.create).toBeUndefined();
  });

  it("clamps out-of-range coordinates returned by Claude to image bounds", async () => {
    const { client } = makeMockClient({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            { name: "top_of_left_femoral_head", displayName: "L femoral head", x: 9999, y: -50, confidence: 0.9 },
          ]),
        },
      ],
    });
    const result = await detectLandmarks({
      imageBytes: MINIMAL_BYTES,
      mediaType: "image/jpeg",
      imageWidth: 1024,
      imageHeight: 768,
      client,
      preprocess: false,
    });
    expect(result[0].x).toBe(1024);
    expect(result[0].y).toBe(0);
  });

  it("strips a markdown code fence if Claude wraps the JSON despite the prompt", async () => {
    const fenced = "```json\n[{\"name\":\"top_of_left_femoral_head\",\"displayName\":\"L\",\"x\":100,\"y\":100,\"confidence\":0.7}]\n```";
    const { client } = makeMockClient({ content: [{ type: "text", text: fenced }] });
    const result = await detectLandmarks({
      imageBytes: MINIMAL_BYTES,
      mediaType: "image/jpeg",
      imageWidth: 1024,
      imageHeight: 768,
      client,
      preprocess: false,
    });
    expect(result).toHaveLength(1);
    // L/R prefixes are stripped server-side — chiros read laterality from
    // position, and Claude flips left/right too often to be trusted.
    expect(result[0].name).toBe("top_of_femoral_head");
  });

  it("filters malformed entries instead of failing the whole call", async () => {
    const mixed = JSON.stringify([
      { name: "top_of_left_femoral_head", displayName: "L", x: 100, y: 100 },
      { name: "missing_coords" }, // dropped
      { x: 50, y: 50 },           // missing name — dropped
      "garbage",                   // not an object — dropped
      { name: "right_iliac_crest", displayName: "R iliac", x: 200, y: 50 },
    ]);
    const { client } = makeMockClient({ content: [{ type: "text", text: mixed }] });
    const result = await detectLandmarks({
      imageBytes: MINIMAL_BYTES,
      mediaType: "image/jpeg",
      imageWidth: 1024,
      imageHeight: 768,
      client,
      preprocess: false,
    });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name)).toEqual(["top_of_femoral_head", "iliac_crest"]);
  });

  it("disambiguates name collisions left-to-right by x-coordinate after stripping", async () => {
    // Both entries collapse to "femoral_head" after laterality stripping.
    // The stripped names should be re-suffixed _1 (leftmost) and _2 (rightmost)
    // so each landmark is uniquely addressable downstream.
    const both = JSON.stringify([
      { name: "right_femoral_head", displayName: "R femoral head", x: 700, y: 400 },
      { name: "left_femoral_head", displayName: "L femoral head", x: 300, y: 400 },
    ]);
    const { client } = makeMockClient({ content: [{ type: "text", text: both }] });
    const result = await detectLandmarks({
      imageBytes: MINIMAL_BYTES,
      mediaType: "image/jpeg",
      imageWidth: 1024,
      imageHeight: 768,
      client,
      preprocess: false,
    });
    expect(result).toHaveLength(2);
    // Result array preserves Claude's input order, but `name` suffixes are
    // assigned by x-coordinate so position determines the unique ID.
    const lefty = result.find((r) => r.x === 300)!;
    const righty = result.find((r) => r.x === 700)!;
    expect(lefty.name).toBe("femoral_head_1");
    expect(righty.name).toBe("femoral_head_2");
    // displayName carries the same suffix so users can tell the bilateral
    // pair apart on the canvas + properties panel.
    expect(lefty.displayName).toBe("Femoral head 1");
    expect(righty.displayName).toBe("Femoral head 2");
  });

  it("preserves Claude-supplied _1 / _2 suffixes by re-stripping then re-disambiguating", async () => {
    // Claude follows the prompt and returns _1/_2; if both also have stale
    // L/R words, our pipeline should still produce clean unique names.
    const claudeFollowed = JSON.stringify([
      { name: "femoral_head_1", displayName: "Femoral head", x: 700, y: 400 }, // right side
      { name: "femoral_head_2", displayName: "Femoral head", x: 300, y: 400 }, // left side
    ]);
    const { client } = makeMockClient({ content: [{ type: "text", text: claudeFollowed }] });
    const result = await detectLandmarks({
      imageBytes: MINIMAL_BYTES,
      mediaType: "image/jpeg",
      imageWidth: 1024,
      imageHeight: 768,
      client,
      preprocess: false,
    });
    expect(result).toHaveLength(2);
    // Re-numbered by x — leftmost gets _1 even if Claude assigned it _2.
    const lefty = result.find((r) => r.x === 300)!;
    const righty = result.find((r) => r.x === 700)!;
    expect(lefty.name).toBe("femoral_head_1");
    expect(righty.name).toBe("femoral_head_2");
  });

  it("leaves a unique name unsuffixed", async () => {
    const single = JSON.stringify([
      { name: "symphysis_pubis", displayName: "Symphysis pubis", x: 500, y: 600 },
    ]);
    const { client } = makeMockClient({ content: [{ type: "text", text: single }] });
    const result = await detectLandmarks({
      imageBytes: MINIMAL_BYTES,
      mediaType: "image/jpeg",
      imageWidth: 1024,
      imageHeight: 768,
      client,
      preprocess: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("symphysis_pubis");
  });

  it("throws VisionApiError on non-JSON Claude response", async () => {
    const { client } = makeMockClient({
      content: [{ type: "text", text: "I'm sorry, I can't help with that." }],
    });
    await expect(
      detectLandmarks({
        imageBytes: MINIMAL_BYTES,
        mediaType: "image/jpeg",
        imageWidth: 1024,
        imageHeight: 768,
        client,
      preprocess: false,
      }),
    ).rejects.toThrow(VisionApiError);
  });
});

describe("stripLaterality", () => {
  it("strips snake_case left/right anywhere in the name", () => {
    expect(stripLaterality("top_of_left_femoral_head")).toBe("top_of_femoral_head");
    expect(stripLaterality("top_of_right_femoral_head")).toBe("top_of_femoral_head");
    expect(stripLaterality("left_sacral_groove")).toBe("sacral_groove");
    expect(stripLaterality("lateral_aspect_of_left_ilium")).toBe("lateral_aspect_of_ilium");
  });

  it("strips snake_case single-letter L/R", () => {
    expect(stripLaterality("lateral_aspect_of_l_ilium")).toBe("lateral_aspect_of_ilium");
    expect(stripLaterality("lateral_aspect_of_r_ilium")).toBe("lateral_aspect_of_ilium");
  });

  it("strips Title-case prefixes", () => {
    expect(stripLaterality("Left Femoral Head")).toBe("Femoral Head");
    expect(stripLaterality("Right Iliac Crest")).toBe("Iliac Crest");
    expect(stripLaterality("L Femoral Head")).toBe("Femoral Head");
    expect(stripLaterality("R Iliac Crest")).toBe("Iliac Crest");
  });

  it("leaves already-stripped names alone", () => {
    expect(stripLaterality("femoral_head")).toBe("femoral_head");
    expect(stripLaterality("Iliac Crest")).toBe("Iliac Crest");
    expect(stripLaterality("symphysis_pubis")).toBe("symphysis_pubis");
  });

  it("does not eat words that merely start with l/r", () => {
    expect(stripLaterality("lumbar_l4")).toBe("lumbar_l4");
    expect(stripLaterality("rib_5")).toBe("rib_5");
  });
});
