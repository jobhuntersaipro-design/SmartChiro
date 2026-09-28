-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'DUITNOW_QR', 'FPX', 'EWALLET', 'BANK_TRANSFER', 'PANEL');

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'PARTIALLY_PAID';

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "invoicePrefix" TEXT,
ADD COLUMN     "invoiceSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "paymentInstructions" TEXT,
ADD COLUMN     "receiptSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ssmRegNo" TEXT,
ADD COLUMN     "sstEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sstRate" DECIMAL(5,2) NOT NULL DEFAULT 6,
ADD COLUMN     "sstRegNo" TEXT,
ADD COLUMN     "tin" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "nationality" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "subtotal" DECIMAL(10,2),
ADD COLUMN     "taxAmount" DECIMAL(10,2),
ADD COLUMN     "taxLabel" TEXT,
ADD COLUMN     "taxRate" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "refundReason" TEXT,
    "invoiceId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNumber_key" ON "Payment"("receiptNumber");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_branchId_receivedAt_idx" ON "Payment"("branchId", "receivedAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill (independent of the new PARTIALLY_PAID value, which Postgres can't
-- use in the same transaction that adds it).
-- Existing invoices: the stored amount is the subtotal (no tax was charged)
-- and they were issued when created.
UPDATE "Invoice" SET "subtotal" = ROUND("amount", 2), "taxAmount" = 0, "issuedAt" = "createdAt";

-- Paid invoices get one migrated cash payment each so balances stay correct.
UPDATE "Invoice" SET "amountPaid" = ROUND("amount", 2) WHERE "status" = 'PAID';

INSERT INTO "Payment" ("id", "amount", "method", "receivedAt", "notes", "receiptNumber", "invoiceId", "branchId", "createdAt")
SELECT 'mig_' || "id", ROUND("amount", 2), 'CASH', COALESCE("paidAt", "updatedAt"), 'Recorded before payments were tracked',
       'MIG-' || "id", "id", "branchId", CURRENT_TIMESTAMP
FROM "Invoice"
WHERE "status" = 'PAID' AND "amount" > 0;
