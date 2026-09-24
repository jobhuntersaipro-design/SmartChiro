import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";

// Auth mock — same shape used across other route tests in this repo.
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// Anthropic vision mock — captures the args we pass so we can assert the
// privacy boundary (no xrayId/patientId/filename leakage).
const mockDetectLandmarks = vi.fn();
const VisionApiErrorRef = vi.hoisted(() =>
  class VisionApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "VisionApiError";
    }
  },
);
vi.mock("@/lib/anthropic-vision", () => ({
  detectLandmarks: (...args: unknown[]) => mockDetectLandmarks(...args),
  VisionApiError: VisionApiErrorRef,
}));

const TEST_PREFIX = `test-detect-landmarks-${Date.now()}`;

let memberId: string;
let outsiderId: string;
let branchId: string;
let patientId: string;
let xrayId: string;
let badMimeXrayId: string;
let missingDimsXrayId: string;

function req(body?: unknown) {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new NextRequest("http://localhost:3000/api/viewer/detect-landmarks", init);
}

// Stub global fetch so the route's R2 image pull doesn't escape the test.
// Default body is 8 zero bytes — fine for tests that don't exercise the
// sharp() crop path; for crop tests we substitute a real generated PNG.
const originalFetch = global.fetch;
function stubFetch(ok: boolean, bytes?: Uint8Array) {
  global.fetch = vi.fn(async () => ({
    ok,
    arrayBuffer: async () => {
      if (!bytes) return new ArrayBuffer(8);
      // Hand back a fresh ArrayBuffer copy so Node's Buffer.from sees a
      // clean buffer (some test environments return SharedArrayBuffer-backed
      // Uint8Array which sharp can't decode).
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return copy.buffer;
    },
  } as unknown as Response)) as unknown as typeof global.fetch;
}

// Generate a real test PNG of the given dimensions so the route's
// sharp().extract() call has something it can actually decode + crop.
async function makeTestPng(width: number, height: number): Promise<Uint8Array> {
  const bytes = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .png()
    .toBuffer();
  return new Uint8Array(bytes);
}

describe("POST /api/viewer/detect-landmarks", () => {
  beforeAll(async () => {
    const member = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-member@t.com`, name: "Member" },
    });
    const outsider = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-outsider@t.com`, name: "Outsider" },
    });
    memberId = member.id;
    outsiderId = outsider.id;

    const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX} B` } });
    const otherBranch = await prisma.branch.create({
      data: { name: `${TEST_PREFIX} OB` },
    });
    branchId = branch.id;

    await prisma.branchMember.create({
      data: { userId: memberId, branchId, role: "DOCTOR" },
    });
    await prisma.branchMember.create({
      data: { userId: outsiderId, branchId: otherBranch.id, role: "OWNER" },
    });

    const patient = await prisma.patient.create({
      data: {
        firstName: "P",
        lastName: TEST_PREFIX,
        branchId,
        doctorId: memberId,
      },
    });
    patientId = patient.id;

    const xray = await prisma.xray.create({
      data: {
        patientId,
        uploadedById: memberId,
        fileName: "pelvis.jpg",
        fileSize: 1024,
        mimeType: "image/jpeg",
        fileUrl: "http://r2-stub/pelvis.jpg",
        width: 1024,
        height: 1024,
      },
    });
    xrayId = xray.id;

    const badMime = await prisma.xray.create({
      data: {
        patientId,
        uploadedById: memberId,
        fileName: "scan.tiff",
        fileSize: 1024,
        mimeType: "image/tiff",
        fileUrl: "http://r2-stub/scan.tiff",
        width: 1024,
        height: 1024,
      },
    });
    badMimeXrayId = badMime.id;

    const missingDims = await prisma.xray.create({
      data: {
        patientId,
        uploadedById: memberId,
        fileName: "nodims.jpg",
        fileSize: 1024,
        mimeType: "image/jpeg",
        fileUrl: "http://r2-stub/nodims.jpg",
      },
    });
    missingDimsXrayId = missingDims.id;
  });

  afterAll(async () => {
    await prisma.xray.deleteMany({ where: { patientId } });
    await prisma.patient.deleteMany({ where: { lastName: TEST_PREFIX } });
    await prisma.branchMember.deleteMany({
      where: { userId: { in: [memberId, outsiderId] } },
    });
    await prisma.branch.deleteMany({
      where: { name: { startsWith: TEST_PREFIX } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: TEST_PREFIX } },
    });
    mockAuth.mockReset();
    mockDetectLandmarks.mockReset();
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    mockAuth.mockReset();
    mockDetectLandmarks.mockReset();
    stubFetch(true);
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed JSON body", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    const { POST } = await import("../route");
    const badReq = new NextRequest("http://localhost:3000/api/viewer/detect-landmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("returns 400 when xrayId is missing", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    const { POST } = await import("../route");
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the requester is not in the X-ray's branch (no existence leak)", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: outsiderId } });
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId }));
    expect(res.status).toBe(404);
    expect(mockDetectLandmarks).not.toHaveBeenCalled();
  });

  it("returns 404 for an X-ray that doesn't exist", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId: "nonexistent-xray-id" }));
    expect(res.status).toBe(404);
  });

  it("returns 415 for an unsupported mimeType", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId: badMimeXrayId }));
    expect(res.status).toBe(415);
  });

  it("returns 422 when the X-ray is missing dimensions", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId: missingDimsXrayId }));
    expect(res.status).toBe(422);
  });

  it("returns 502 when R2 image fetch fails", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    stubFetch(false);
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId }));
    expect(res.status).toBe(502);
  });

  it("returns 413 when Anthropic rejects the image as too large", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    mockDetectLandmarks.mockRejectedValueOnce(
      new VisionApiErrorRef("image_too_large", "Image exceeds the model limit."),
    );
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId }));
    expect(res.status).toBe(413);
  });

  it("returns 429 when Anthropic rate-limits the request", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    mockDetectLandmarks.mockRejectedValueOnce(
      new VisionApiErrorRef("rate_limited", "Slow down."),
    );
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId }));
    expect(res.status).toBe(429);
  });

  it("returns 502 on a generic Anthropic vision error", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    mockDetectLandmarks.mockRejectedValueOnce(
      new VisionApiErrorRef("vision_api_error", "Bad gateway."),
    );
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId }));
    expect(res.status).toBe(502);
  });

  it("returns 200 + landmarks on the happy path", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    mockDetectLandmarks.mockResolvedValueOnce([
      { name: "top_of_femoral_head_1", displayName: "L femoral head", x: 200, y: 600 },
      { name: "top_of_femoral_head_2", displayName: "R femoral head", x: 800, y: 610 },
    ]);
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      landmarks: Array<{ name: string; x: number; y: number }>;
    };
    expect(body.landmarks).toHaveLength(2);
    expect(body.landmarks[0].name).toBe("top_of_femoral_head_1");
  });

  // ─── Privacy boundary contract ───
  //
  // The route's whole reason for existence is that the X-ray ID never reaches
  // Anthropic. These assertions pin the contract: if anyone ever wires a
  // patient/xray/filename field into the detectLandmarks call args, this test
  // breaks.
  it("sends ONLY image bytes + media type + dimensions to Anthropic — no DB identifiers", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    mockDetectLandmarks.mockResolvedValueOnce([]);
    const { POST } = await import("../route");
    await POST(req({ xrayId }));

    expect(mockDetectLandmarks).toHaveBeenCalledTimes(1);
    const callArg = mockDetectLandmarks.mock.calls[0][0] as Record<string, unknown>;

    // Expected fields only.
    expect(Object.keys(callArg).sort()).toEqual(
      ["imageBytes", "imageHeight", "imageWidth", "mediaType"].sort(),
    );
    expect(Buffer.isBuffer(callArg.imageBytes)).toBe(true);
    expect(callArg.mediaType).toBe("image/jpeg");
    expect(callArg.imageWidth).toBe(1024);
    expect(callArg.imageHeight).toBe(1024);

    // Stringify the entire payload and assert none of the leakable identifiers
    // show up in any form. If a future change ever stuffs the xrayId into a
    // metadata field, this serialization will catch it.
    const serialized = JSON.stringify(
      callArg,
      (_k, v) => (Buffer.isBuffer(v) ? "[bytes]" : v),
    );
    expect(serialized).not.toContain(xrayId);
    expect(serialized).not.toContain(patientId);
    expect(serialized).not.toContain(branchId);
    expect(serialized).not.toContain(memberId);
    expect(serialized).not.toContain("pelvis.jpg");
    expect(serialized).not.toContain(TEST_PREFIX);
  });

  // ─── Viewport-crop pathway ───
  //
  // When the client is zoomed in we accept a cropBox in image coords; the
  // server crops with sharp, hands the smaller image to Claude, then
  // translates the returned coordinates back into the original-image frame.
  // The client is never aware that a crop happened.
  describe("cropBox handling", () => {
    it("applies the crop and translates landmark coords back into the original image", async () => {
      const png = await makeTestPng(1024, 1024);
      stubFetch(true, png);
      mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
      // Claude's coords are in the CROP frame (200..700 / 300..800), so
      // (50, 50) inside the crop maps to (250, 350) in the original image.
      mockDetectLandmarks.mockResolvedValueOnce([
        { name: "top_of_femoral_head_1", displayName: "L femoral head", x: 50, y: 50 },
        { name: "top_of_femoral_head_2", displayName: "R femoral head", x: 400, y: 50 },
      ]);

      const { POST } = await import("../route");
      const res = await POST(
        req({
          xrayId,
          cropBox: { x: 200, y: 300, width: 500, height: 500 },
        }),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        landmarks: Array<{ name: string; x: number; y: number }>;
      };
      // 50 + 200 = 250, 50 + 300 = 350
      expect(body.landmarks[0]).toMatchObject({ x: 250, y: 350 });
      // 400 + 200 = 600, 50 + 300 = 350
      expect(body.landmarks[1]).toMatchObject({ x: 600, y: 350 });

      // detectLandmarks should have seen the CROP dimensions, not the
      // original — that's how Claude knows to bound coords correctly.
      const callArg = mockDetectLandmarks.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.imageWidth).toBe(500);
      expect(callArg.imageHeight).toBe(500);
    });

    it("clamps crops that extend past the image bounds", async () => {
      const png = await makeTestPng(1024, 1024);
      stubFetch(true, png);
      mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
      mockDetectLandmarks.mockResolvedValueOnce([
        { name: "x", displayName: "x", x: 10, y: 10 },
      ]);

      const { POST } = await import("../route");
      // Box starts at (900, 900) and is "200x200" — should be clamped to
      // (900..1024, 900..1024), i.e. 124x124 region.
      const res = await POST(
        req({
          xrayId,
          cropBox: { x: 900, y: 900, width: 200, height: 200 },
        }),
      );

      expect(res.status).toBe(200);
      const callArg = mockDetectLandmarks.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.imageWidth).toBe(124);
      expect(callArg.imageHeight).toBe(124);
    });

    it("ignores a degenerate cropBox (too small) and sends the full image", async () => {
      const png = await makeTestPng(1024, 1024);
      stubFetch(true, png);
      mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
      mockDetectLandmarks.mockResolvedValueOnce([
        { name: "x", displayName: "x", x: 100, y: 100 },
      ]);

      const { POST } = await import("../route");
      // < 64 px wide — falls back to the full image; coords stay verbatim.
      const res = await POST(
        req({ xrayId, cropBox: { x: 100, y: 100, width: 10, height: 10 } }),
      );

      expect(res.status).toBe(200);
      const callArg = mockDetectLandmarks.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.imageWidth).toBe(1024);
      expect(callArg.imageHeight).toBe(1024);
      const body = (await res.json()) as { landmarks: Array<{ x: number; y: number }> };
      expect(body.landmarks[0]).toMatchObject({ x: 100, y: 100 });
    });

    it("ignores a malformed cropBox and falls back to the full image", async () => {
      const png = await makeTestPng(1024, 1024);
      stubFetch(true, png);
      mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
      mockDetectLandmarks.mockResolvedValueOnce([]);

      const { POST } = await import("../route");
      const res = await POST(
        req({
          xrayId,
          cropBox: { x: "not-a-number", y: 0, width: 100, height: 100 } as unknown,
        }),
      );

      expect(res.status).toBe(200);
      const callArg = mockDetectLandmarks.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.imageWidth).toBe(1024);
    });
  });

  // ─── Bias-correction pathway ───
  //
  // Once a few users have dragged the same landmark on similar X-rays, the
  // route reads those rows and applies a median normalized delta to
  // Claude's output before responding. `?raw=1` bypasses correction so we
  // can A/B against the model's unaided guess.
  describe("bias correction", () => {
    afterAll(async () => {
      await prisma.aiLandmarkCorrection.deleteMany({ where: { xrayId } });
    });

    async function seedCorrections(
      landmarkName: string,
      n: number,
      deltaFracX: number,
      deltaFracY: number,
    ) {
      // Each correction is a distinct (xrayId, landmarkName) row, but the
      // table only stores ONE row per pair. We seed against scratch X-rays
      // so the threshold check sees enough samples.
      for (let i = 0; i < n; i++) {
        const scratch = await prisma.xray.create({
          data: {
            patientId,
            uploadedById: memberId,
            fileName: `scratch-${i}.jpg`,
            fileSize: 1024,
            mimeType: "image/jpeg",
            fileUrl: `http://r2-stub/scratch-${i}.jpg`,
            width: 1000,
            height: 1000,
          },
        });
        await prisma.aiLandmarkCorrection.create({
          data: {
            xrayId: scratch.id,
            userId: memberId,
            landmarkName,
            displayName: landmarkName,
            aiX: 100,
            aiY: 100,
            finalX: 100 + deltaFracX * 1000,
            finalY: 100 + deltaFracY * 1000,
            imageWidth: 1000,
            imageHeight: 1000,
          },
        });
      }
    }

    it("applies median normalized delta from prior corrections", async () => {
      await seedCorrections("top_of_femoral_head_1", 3, 0.05, -0.02);
      mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
      mockDetectLandmarks.mockResolvedValueOnce([
        { name: "top_of_femoral_head_1", displayName: "L femoral head", x: 200, y: 300 },
      ]);

      const { POST } = await import("../route");
      const res = await POST(req({ xrayId }));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        landmarks: Array<{ name: string; x: number; y: number }>;
        meta: { biasApplied: number; rawMode: boolean };
      };
      // x: 200 + 0.05 * 1024 = 251.2
      // y: 300 + (-0.02) * 1024 = 279.52
      expect(body.landmarks[0].x).toBeCloseTo(251.2, 4);
      expect(body.landmarks[0].y).toBeCloseTo(279.52, 4);
      expect(body.meta.biasApplied).toBe(1);
      expect(body.meta.rawMode).toBe(false);
    });

    it("skips correction when ?raw=1 is set on the query string", async () => {
      // Reuse the seeded corrections from the previous test.
      mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
      mockDetectLandmarks.mockResolvedValueOnce([
        { name: "top_of_femoral_head_1", displayName: "L femoral head", x: 200, y: 300 },
      ]);

      const { POST } = await import("../route");
      const reqWithRaw = new NextRequest(
        "http://localhost:3000/api/viewer/detect-landmarks?raw=1",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ xrayId }),
        },
      );
      const res = await POST(reqWithRaw);
      const body = (await res.json()) as {
        landmarks: Array<{ x: number; y: number }>;
        meta: { biasApplied: number; rawMode: boolean };
      };
      expect(body.landmarks[0].x).toBe(200);
      expect(body.landmarks[0].y).toBe(300);
      expect(body.meta.rawMode).toBe(true);
      expect(body.meta.biasApplied).toBe(0);
    });

    it("leaves a landmark alone when fewer than the threshold of corrections exist", async () => {
      // Only seed 1 correction for "second_sacral_tubercle" — below the
      // default min-samples threshold of 3.
      await seedCorrections("second_sacral_tubercle", 1, 0.1, 0.1);
      mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
      mockDetectLandmarks.mockResolvedValueOnce([
        { name: "second_sacral_tubercle", displayName: "S2 tubercle", x: 500, y: 500 },
      ]);

      const { POST } = await import("../route");
      const res = await POST(req({ xrayId }));
      const body = (await res.json()) as {
        landmarks: Array<{ x: number; y: number }>;
        meta: { biasApplied: number };
      };
      expect(body.landmarks[0].x).toBe(500);
      expect(body.landmarks[0].y).toBe(500);
      expect(body.meta.biasApplied).toBe(0);
    });
  });
});
