-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('INITIAL_CONSULTATION', 'FIRST_TREATMENT', 'FOLLOW_UP', 'RE_EVALUATION', 'EMERGENCY', 'DISCHARGE', 'OTHER');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PatientPackageStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'EWALLET', 'INSURANCE', 'OTHER');

-- AlterTable: Invoice
ALTER TABLE "Invoice" ADD COLUMN "paymentMethod" "PaymentMethod";

-- AlterTable: Visit — backfill-preserving conversion of visitType String -> enum
ALTER TABLE "Visit" ADD COLUMN "visitType_new" "VisitType";

UPDATE "Visit"
SET "visitType_new" = CASE
  WHEN "visitType" IN ('initial', 'INITIAL', 'initial_consultation', 'INITIAL_CONSULTATION') THEN 'INITIAL_CONSULTATION'::"VisitType"
  WHEN "visitType" IN ('first_treatment', 'FIRST_TREATMENT') THEN 'FIRST_TREATMENT'::"VisitType"
  WHEN "visitType" IN ('follow_up', 'FOLLOW_UP', 'followup') THEN 'FOLLOW_UP'::"VisitType"
  WHEN "visitType" IN ('reassessment', 'REASSESSMENT', 're_evaluation', 'RE_EVALUATION') THEN 'RE_EVALUATION'::"VisitType"
  WHEN "visitType" IN ('emergency', 'EMERGENCY') THEN 'EMERGENCY'::"VisitType"
  WHEN "visitType" IN ('discharge', 'DISCHARGE') THEN 'DISCHARGE'::"VisitType"
  WHEN "visitType" IS NULL THEN NULL
  ELSE 'OTHER'::"VisitType"
END;

DROP INDEX IF EXISTS "Visit_visitType_idx";
ALTER TABLE "Visit" DROP COLUMN "visitType";
ALTER TABLE "Visit" RENAME COLUMN "visitType_new" TO "visitType";

-- AlterTable: Visit — billing links
ALTER TABLE "Visit"
  ADD COLUMN "invoiceId" TEXT,
  ADD COLUMN "patientPackageId" TEXT;

-- CreateTable: Package
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sessionCount" INTEGER NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "validityDays" INTEGER,
    "status" "PackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PatientPackage
CREATE TABLE "PatientPackage" (
    "id" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "sessionsTotal" INTEGER NOT NULL,
    "sessionsUsed" INTEGER NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(65,30) NOT NULL,
    "status" "PatientPackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "patientId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatientPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Package_branchId_idx" ON "Package"("branchId");
CREATE INDEX "Package_status_idx" ON "Package"("status");

CREATE UNIQUE INDEX "PatientPackage_invoiceId_key" ON "PatientPackage"("invoiceId");
CREATE INDEX "PatientPackage_patientId_idx" ON "PatientPackage"("patientId");
CREATE INDEX "PatientPackage_branchId_idx" ON "PatientPackage"("branchId");
CREATE INDEX "PatientPackage_packageId_idx" ON "PatientPackage"("packageId");
CREATE INDEX "PatientPackage_status_idx" ON "PatientPackage"("status");

CREATE INDEX "Invoice_paidAt_idx" ON "Invoice"("paidAt");

CREATE UNIQUE INDEX "Visit_invoiceId_key" ON "Visit"("invoiceId");
CREATE INDEX "Visit_visitType_idx" ON "Visit"("visitType");
CREATE INDEX "Visit_patientPackageId_idx" ON "Visit"("patientPackageId");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_patientPackageId_fkey" FOREIGN KEY ("patientPackageId") REFERENCES "PatientPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Package" ADD CONSTRAINT "Package_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
