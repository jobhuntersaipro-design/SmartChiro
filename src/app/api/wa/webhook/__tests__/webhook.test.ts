import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { signRequest } from "@/lib/wa/hmac";
import { POST } from "../route";

const TEST_PREFIX = "rem-wh-";
const SECRET = "outbound-secret";

beforeEach(async () => {
  process.env.WORKER_OUTBOUND_SECRET = SECRET;
  await prisma.waSession.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branchMember.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
});

function makeReq(body: object, opts?: { secret?: string; ts?: number }) {
  const raw = JSON.stringify(body);
  const ts = opts?.ts ?? Math.floor(Date.now() / 1000);
  const sig = signRequest({
    secret: opts?.secret ?? SECRET,
    body: raw,
    timestamp: ts,
  });
  return new Request("http://x/api/wa/webhook", {
    method: "POST",
    headers: {
      "x-signature": sig,
      "x-timestamp": String(ts),
      "content-type": "application/json",
    },
    body: raw,
  });
}

describe("POST /api/wa/webhook", () => {
  it("rejects bad HMAC", async () => {
    const res = await POST(makeReq({ type: "qr" }, { secret: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("handles `qr` event by setting qrPayload + status=PAIRING", async () => {
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const branch = await prisma.branch.create({
      data: { name: `${TEST_PREFIX}b-${stamp}` },
    });
    const res = await POST(
      makeReq({ type: "qr", branchId: branch.id, qrPayload: "BASE64" })
    );
    expect(res.status).toBe(200);
    const row = await prisma.waSession.findUniqueOrThrow({
      where: { branchId: branch.id },
    });
    expect(row.status).toBe("PAIRING");
    expect(row.qrPayload).toBe("BASE64");
  });

  it("handles `connected` event by setting status + phoneNumber and clearing qr", async () => {
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const branch = await prisma.branch.create({
      data: { name: `${TEST_PREFIX}b-${stamp}` },
    });
    await prisma.waSession.create({
      data: { branchId: branch.id, status: "PAIRING", qrPayload: "X" },
    });
    const res = await POST(
      makeReq({ type: "connected", branchId: branch.id, phoneNumber: "+60123" })
    );
    expect(res.status).toBe(200);
    const row = await prisma.waSession.findUniqueOrThrow({
      where: { branchId: branch.id },
    });
    expect(row.status).toBe("CONNECTED");
    expect(row.phoneNumber).toBe("+60123");
    expect(row.qrPayload).toBeNull();
  });

  it("handles `logged_out` event", async () => {
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const branch = await prisma.branch.create({
      data: { name: `${TEST_PREFIX}b-${stamp}` },
    });
    await prisma.waSession.create({
      data: {
        branchId: branch.id,
        status: "CONNECTED",
        phoneNumber: "+60123",
      },
    });
    await POST(
      makeReq({
        type: "logged_out",
        branchId: branch.id,
        reason: "user removed device",
      })
    );
    const row = await prisma.waSession.findUniqueOrThrow({
      where: { branchId: branch.id },
    });
    expect(row.status).toBe("LOGGED_OUT");
  });
});
