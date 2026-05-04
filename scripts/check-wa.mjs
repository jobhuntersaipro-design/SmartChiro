import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter });

const branchId = "personal-branch-002";
const wa = await p.waSession.findUnique({ where: { branchId } });
console.log("WaSession:", wa
  ? { status: wa.status, phoneNumber: wa.phoneNumber, hasQrPayload: !!wa.qrPayload, qrLen: wa.qrPayload?.length ?? 0, lastSeenAt: wa.lastSeenAt, updatedAt: wa.updatedAt }
  : "NOT FOUND");
await p.$disconnect();
