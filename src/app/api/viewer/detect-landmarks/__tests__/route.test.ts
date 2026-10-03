import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetRateLimits } from "@/lib/booking/rate-limit";
import type { DetectLandmarksResponse, PelvisImageAssessment } from "@/types/pelvis";

// Auth mock — same shape used across other route tests in this repo.
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// Vision mock — captures the args we pass so we can assert the privacy
// boundary (no xrayId/patientId/filename leakage).
const mockAnalysePelvis = vi.fn();
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
  analysePelvis: (...args: unknown[]) => mockAnalysePelvis(...args),
  VisionApiError: VisionApiErrorRef,
}));

const TEST_PREFIX = `test-detect-landmarks-${Date.now()}`;

let memberId: string;
let outsiderId: string;
let branchId: string;
let patientId: string;
let xrayId: string;
let badMimeXrayId: string;
let notReadyXrayId: string;

function req(body?: unknown) {
  const init: ConstructorParameters<typeof NextRequest>[1] = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new NextRequest("http://localhost:3000/api/viewer/detect-landmarks", init);
}

// Stub global fetch so the route's R2 image pull doesn't escape the test.
const originalFetch = global.fetch;
function stubFetch(ok: boolean) {
  global.fetch = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as Response)) as unknown as typeof global.fetch;
}

const ASSESSMENT: PelvisImageAssessment = {
  isRadiograph: true,
  projection: "AP",
  region: "pelvis",
  visible: { iliacCrests: true, femoralHeads: true, ischialTuberosities: true, sacrum: true, pubicSymphysis: true },
  hipImplant: false,
  overlays: false,
  quality: "good",
  sideMarker: null,
  pelvisBox: [100, 100, 900, 800],
  notes: "AP pelvis.",
};

const ACCEPTED: DetectLandmarksResponse = {
  landmarks: [
    { id: 1, key: "femoral_head_top_img_left", x: 300, y: 600, confidence: 0.8 },
    { id: 2, key: "femoral_head_top_img_right", x: 700, y: 610, confidence: 0.7 },
  ],
  assessment: ASSESSMENT,
  patientRightOn: "left",
  sideSource: "assumed",
  warnings: [],
  model: "claude-opus-5-5",
};

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
        status: "READY",
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
        status: "READY",
        fileName: "scan.tiff",
        fileSize: 1024,
        mimeType: "image/tiff",
        fileUrl: "http://r2-stub/scan.tiff",
      },
    });
    badMimeXrayId = badMime.id;

    const notReady = await prisma.xray.create({
      data: {
        patientId,
        uploadedById: memberId,
        status: "UPLOADING",
        fileName: "pending.jpg",
        fileSize: 1024,
        mimeType: "image/jpeg",
        fileUrl: "http://r2-stub/pending.jpg",
      },
    });
    notReadyXrayId = notReady.id;
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
    mockAnalysePelvis.mockReset();
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    mockAuth.mockReset();
    mockAnalysePelvis.mockReset();
    resetRateLimits();
    stubFetch(true);
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    expect(mockAnalysePelvis).not.toHaveBeenCalled();
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

  it("returns 409 when the X-ray upload hasn't finished", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId: notReadyXrayId }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "XRAY_NOT_READY" });
    expect(mockAnalysePelvis).not.toHaveBeenCalled();
  });

  it("returns 503 AI_NOT_CONFIGURED without an Anthropic key, before fetching the film", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "AI_NOT_CONFIGURED" });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockAnalysePelvis).not.toHaveBeenCalled();
  });

  it("returns 502 when R2 responds with an error", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    stubFetch(false);
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "R2_FETCH_FAILED" });
  });

  it("returns 502 when the R2 fetch throws (e.g. timeout)", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    global.fetch = vi.fn(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as unknown as typeof global.fetch;
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId }));
    expect(res.status).toBe(502);
    expect(mockAnalysePelvis).not.toHaveBeenCalled();
  });

  it.each([
    ["image_too_large", 413, "IMAGE_TOO_LARGE"],
    ["invalid_image", 422, "INVALID_IMAGE"],
    ["rate_limited", 429, "RATE_LIMITED"],
    ["vision_api_error", 502, "VISION_API_ERROR"],
  ])("maps VisionApiError %s to %i %s", async (code, status, error) => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    mockAnalysePelvis.mockRejectedValueOnce(new VisionApiErrorRef(code, "Vision failed."));
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error, message: "Vision failed." });
  });

  it("returns 422 NOT_SUITABLE with reasons when the image is rejected", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    const assessment = { ...ASSESSMENT, projection: "lateral" as const };
    const reasons = ["This looks like a lateral view; the analysis needs an AP (front-to-back) view of the pelvis."];
    mockAnalysePelvis.mockResolvedValueOnce({ kind: "rejected", assessment, reasons });
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "NOT_SUITABLE",
      message: "This X-ray isn't suitable for AI pelvic analysis.",
      reasons,
      assessment,
    });
  });

  it("returns 200 + the DetectLandmarksResponse on the happy path", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    mockAnalysePelvis.mockResolvedValueOnce({ kind: "accepted", ...ACCEPTED });
    const { POST } = await import("../route");
    const res = await POST(req({ xrayId }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ACCEPTED);
  });

  it("rate-limits each user to 6 analyses per 10 minutes", async () => {
    mockAuth.mockResolvedValue({ user: { id: memberId } });
    mockAnalysePelvis.mockResolvedValue({ kind: "accepted", ...ACCEPTED });
    const { POST } = await import("../route");
    for (let i = 0; i < 6; i++) expect((await POST(req({ xrayId }))).status).toBe(200);
    const limited = await POST(req({ xrayId }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("100");
    expect(mockAnalysePelvis).toHaveBeenCalledTimes(6);
  });

  // ─── Privacy boundary contract ───
  //
  // The route's whole reason for existence is that the X-ray ID never reaches
  // Anthropic. If anyone ever wires a patient/xray/filename field into the
  // analysePelvis call args, this test breaks.
  it("sends ONLY image bytes to the vision lib — no DB identifiers", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: memberId } });
    mockAnalysePelvis.mockResolvedValueOnce({ kind: "accepted", ...ACCEPTED });
    const { POST } = await import("../route");
    await POST(req({ xrayId }));

    expect(mockAnalysePelvis).toHaveBeenCalledTimes(1);
    const callArg = mockAnalysePelvis.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(callArg)).toEqual(["imageBytes"]);
    expect(Buffer.isBuffer(callArg.imageBytes)).toBe(true);

    const serialized = JSON.stringify(callArg, (k, v) => (k === "imageBytes" ? "[bytes]" : v));
    expect(serialized).not.toContain(xrayId);
    expect(serialized).not.toContain(patientId);
    expect(serialized).not.toContain(branchId);
    expect(serialized).not.toContain(memberId);
    expect(serialized).not.toContain("pelvis.jpg");
    expect(serialized).not.toContain(TEST_PREFIX);
  });
});
