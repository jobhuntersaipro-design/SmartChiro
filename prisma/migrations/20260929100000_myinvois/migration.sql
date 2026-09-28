-- CreateEnum
CREATE TYPE "EInvoiceStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'VALID', 'INVALID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EInvoiceKind" AS ENUM ('INVOICE', 'CREDIT_NOTE', 'REFUND_NOTE', 'CONSOLIDATED');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "businessActivity" TEXT,
ADD COLUMN     "einvoiceEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "msicCode" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "passportNumber" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "consolidatedIntoId" TEXT,
ADD COLUMN     "einvoiceStatus" "EInvoiceStatus" NOT NULL DEFAULT 'NOT_SUBMITTED';

-- CreateTable
CREATE TABLE "EInvoiceSubmission" (
    "id" TEXT NOT NULL,
    "kind" "EInvoiceKind" NOT NULL,
    "status" "EInvoiceStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "codeNumber" TEXT NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "document" TEXT,
    "submissionUid" TEXT,
    "uuid" TEXT,
    "longId" TEXT,
    "errors" JSONB,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "lastPolledAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EInvoiceSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EInvoiceSubmission_invoiceId_createdAt_idx" ON "EInvoiceSubmission"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "EInvoiceSubmission_branchId_kind_periodStart_idx" ON "EInvoiceSubmission"("branchId", "kind", "periodStart");

-- CreateIndex
CREATE INDEX "EInvoiceSubmission_status_lastPolledAt_idx" ON "EInvoiceSubmission"("status", "lastPolledAt");

-- CreateIndex
CREATE INDEX "EInvoiceSubmission_submissionUid_idx" ON "EInvoiceSubmission"("submissionUid");

-- CreateIndex
CREATE INDEX "EInvoiceSubmission_uuid_idx" ON "EInvoiceSubmission"("uuid");

-- CreateIndex
CREATE INDEX "Invoice_branchId_einvoiceStatus_issuedAt_idx" ON "Invoice"("branchId", "einvoiceStatus", "issuedAt");

-- CreateIndex
CREATE INDEX "Invoice_consolidatedIntoId_idx" ON "Invoice"("consolidatedIntoId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_consolidatedIntoId_fkey" FOREIGN KEY ("consolidatedIntoId") REFERENCES "EInvoiceSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceSubmission" ADD CONSTRAINT "EInvoiceSubmission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceSubmission" ADD CONSTRAINT "EInvoiceSubmission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceSubmission" ADD CONSTRAINT "EInvoiceSubmission_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceSubmission" ADD CONSTRAINT "EInvoiceSubmission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

