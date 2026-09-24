import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const TEST_PREFIX = `test-annotation-save-${Date.now()}`;

let userId: string;
let branchId: string;
let patientId: string;
let xrayId: string;
let annotationId: string;

function req(body: unknown) {
  return new NextRequest(
    `http://localhost:3000/api/annotations/${annotationId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("PUT /api/annotations/[id] — landmark correction capture", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `${TEST_PREFIX}@t.com`, name: "Member" },
    });
    userId = user.id;

    const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX} B` } });
    branchId = branch.id;
    await prisma.branchMember.create({
      data: { userId, branchId, role: "DOCTOR" },
    });

    const patient = await prisma.patient.create({
      data: {
        firstName: "P",
        lastName: TEST_PREFIX,
        branchId,
        doctorId: userId,
      },
    });
    patientId = patient.id;

    const xray = await prisma.xray.create({
      data: {
        patientId,
        uploadedById: userId,
        fileName: "pelvis.jpg",
        fileSize: 1024,
        mimeType: "image/jpeg",
        fileUrl: "http://r2-stub/pelvis.jpg",
        width: 3024,
        height: 1964,
      },
    });
    xrayId = xray.id;

    const ann = await prisma.annotation.create({
      data: {
        xrayId,
        createdById: userId,
        canvasState: { version: 1, shapes: [] },
      },
    });
    annotationId = ann.id;
  });

  afterAll(async () => {
    await prisma.aiLandmarkCorrection.deleteMany({ where: { xrayId } });
    await prisma.annotation.deleteMany({ where: { xrayId } });
    await prisma.xray.deleteMany({ where: { patientId } });
    await prisma.patient.deleteMany({ where: { lastName: TEST_PREFIX } });
    await prisma.branchMember.deleteMany({ where: { userId } });
    await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
  });

  it("upserts a correction row when a manually-adjusted landmark is saved", async () => {
    const canvasState = {
      version: 1,
      shapes: [
        {
          id: "lm-1",
          type: "landmark",
          label: "Femoral head 1",
          zIndex: 1,
          visible: true,
          locked: false,
          style: { strokeColor: "#10B981", strokeWidth: 2, strokeOpacity: 1, fillColor: null, fillOpacity: 0.3, lineDash: [] },
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          points: [{ x: 1400, y: 1100 }],
          text: null,
          fontSize: null,
          measurement: null,
          landmarkName: "top_of_femoral_head_1",
          landmarkSource: "manual",
          landmarkOriginalX: 1380,
          landmarkOriginalY: 1080,
        },
      ],
    };

    const { PUT } = await import("../route");
    const res = await PUT(req({ canvasState, canvasStateSize: 1024 }), {
      params: Promise.resolve({ annotationId }),
    });
    expect(res.status).toBe(200);

    const stored = await prisma.aiLandmarkCorrection.findUnique({
      where: {
        xrayId_landmarkName: { xrayId, landmarkName: "top_of_femoral_head_1" },
      },
    });
    expect(stored).not.toBeNull();
    expect(stored!.aiX).toBe(1380);
    expect(stored!.aiY).toBe(1080);
    expect(stored!.finalX).toBe(1400);
    expect(stored!.finalY).toBe(1100);
    expect(stored!.displayName).toBe("Femoral head 1");
    expect(stored!.imageWidth).toBe(3024);
    expect(stored!.imageHeight).toBe(1964);
    expect(stored!.userId).toBe(userId);
  });

  it("updates the final position on a subsequent save (aiX/aiY stay frozen)", async () => {
    const canvasState = {
      version: 1,
      shapes: [
        {
          id: "lm-1",
          type: "landmark",
          label: "Femoral head 1",
          zIndex: 1,
          visible: true,
          locked: false,
          style: { strokeColor: "#10B981", strokeWidth: 2, strokeOpacity: 1, fillColor: null, fillOpacity: 0.3, lineDash: [] },
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          // User dragged it further on this save.
          points: [{ x: 1450, y: 1150 }],
          text: null,
          fontSize: null,
          measurement: null,
          landmarkName: "top_of_femoral_head_1",
          landmarkSource: "manual",
          // aiX/aiY don't change between saves — they're frozen at detection.
          landmarkOriginalX: 1380,
          landmarkOriginalY: 1080,
        },
      ],
    };

    const { PUT } = await import("../route");
    const res = await PUT(req({ canvasState, canvasStateSize: 1024 }), {
      params: Promise.resolve({ annotationId }),
    });
    expect(res.status).toBe(200);

    const stored = await prisma.aiLandmarkCorrection.findUnique({
      where: {
        xrayId_landmarkName: { xrayId, landmarkName: "top_of_femoral_head_1" },
      },
    });
    expect(stored!.aiX).toBe(1380); // frozen
    expect(stored!.aiY).toBe(1080);
    expect(stored!.finalX).toBe(1450); // updated
    expect(stored!.finalY).toBe(1150);
  });

  it("does not write a row for an unreviewed AI landmark", async () => {
    const canvasState = {
      version: 1,
      shapes: [
        {
          id: "lm-2",
          type: "landmark",
          label: "Iliac crest 1",
          zIndex: 2,
          visible: true,
          locked: false,
          style: { strokeColor: "#EF4444", strokeWidth: 2, strokeOpacity: 1, fillColor: null, fillOpacity: 0.3, lineDash: [] },
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          points: [{ x: 200, y: 100 }],
          text: null,
          fontSize: null,
          measurement: null,
          landmarkName: "top_of_iliac_crest_1",
          landmarkSource: "ai", // <- not yet reviewed
          landmarkOriginalX: 200,
          landmarkOriginalY: 100,
        },
      ],
    };

    const { PUT } = await import("../route");
    const res = await PUT(req({ canvasState, canvasStateSize: 1024 }), {
      params: Promise.resolve({ annotationId }),
    });
    expect(res.status).toBe(200);

    const stored = await prisma.aiLandmarkCorrection.findUnique({
      where: {
        xrayId_landmarkName: { xrayId, landmarkName: "top_of_iliac_crest_1" },
      },
    });
    expect(stored).toBeNull();
  });
});
