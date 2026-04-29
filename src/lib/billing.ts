import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateInvoiceNumber(prefix = "INV") {
  const date = new Date();
  const yyyymm = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  let suffix = "";
  for (let i = 0; i < 6; i += 1) suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${prefix}-${yyyymm}-${suffix}`;
}

export async function nextInvoiceNumber(client: Tx = prisma, prefix = "INV") {
  // Best-effort uniqueness — retry up to 5 times if collision
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateInvoiceNumber(prefix);
    const exists = await client.invoice.findUnique({ where: { invoiceNumber: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  // Fallback — append timestamp
  return `${generateInvoiceNumber(prefix)}-${Date.now()}`;
}

export type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};
