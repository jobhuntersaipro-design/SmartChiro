import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyRequest } from "@/lib/wa/hmac";

const Event = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("qr"),
    branchId: z.string(),
    qrPayload: z.string(),
  }),
  z.object({
    type: z.literal("connected"),
    branchId: z.string(),
    phoneNumber: z.string(),
  }),
  z.object({
    type: z.literal("disconnected"),
    branchId: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("logged_out"),
    branchId: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("ack"),
    branchId: z.string(),
    msgId: z.string(),
    ack: z.enum(["sent", "delivered", "read", "failed"]),
  }),
]);

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.WORKER_OUTBOUND_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const raw = await req.text();
  const sig = req.headers.get("x-signature") ?? "";
  const ts = Number(req.headers.get("x-timestamp") ?? "0");
  const v = verifyRequest({
    secret,
    body: raw,
    signature: sig,
    timestamp: ts,
    nowEpoch: Math.floor(Date.now() / 1000),
  });
  if (!v.ok) return NextResponse.json({ error: v.message }, { status: 401 });

  const parsed = Event.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }

  const e = parsed.data;
  switch (e.type) {
    case "qr":
      await prisma.waSession.upsert({
        where: { branchId: e.branchId },
        create: {
          branchId: e.branchId,
          status: "PAIRING",
          qrPayload: e.qrPayload,
        },
        update: { status: "PAIRING", qrPayload: e.qrPayload },
      });
      break;
    case "connected":
      await prisma.waSession.upsert({
        where: { branchId: e.branchId },
        create: {
          branchId: e.branchId,
          status: "CONNECTED",
          phoneNumber: e.phoneNumber,
          lastSeenAt: new Date(),
        },
        update: {
          status: "CONNECTED",
          phoneNumber: e.phoneNumber,
          lastSeenAt: new Date(),
          qrPayload: null,
        },
      });
      break;
    case "disconnected":
      await prisma.waSession.upsert({
        where: { branchId: e.branchId },
        create: { branchId: e.branchId, status: "DISCONNECTED" },
        update: { status: "DISCONNECTED", lastSeenAt: new Date() },
      });
      break;
    case "logged_out":
      await prisma.waSession.upsert({
        where: { branchId: e.branchId },
        create: { branchId: e.branchId, status: "LOGGED_OUT" },
        update: { status: "LOGGED_OUT", phoneNumber: null, qrPayload: null },
      });
      break;
    case "ack":
      if (e.ack === "failed") {
        await prisma.appointmentReminder.updateMany({
          where: { externalId: e.msgId, channel: "WHATSAPP" },
          data: { status: "FAILED", failureReason: "wa_ack_failed" },
        });
      }
      break;
  }
  return NextResponse.json({ ok: true });
}
