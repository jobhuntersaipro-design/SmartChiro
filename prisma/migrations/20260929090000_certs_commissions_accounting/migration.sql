-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('PERCENT_COLLECTED', 'FIXED_PER_VISIT', 'PERCENT_PACKAGE_SALE');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "acctBank" TEXT,
ADD COLUMN     "acctCard" TEXT,
ADD COLUMN     "acctCash" TEXT,
ADD COLUMN     "acctEwallet" TEXT,
ADD COLUMN     "acctPanel" TEXT,
ADD COLUMN     "acctReceivable" TEXT,
ADD COLUMN     "acctSales" TEXT,
ADD COLUMN     "acctSst" TEXT;

-- AlterTable
ALTER TABLE "DoctorProfile" ADD COLUMN     "apcAlertStage" INTEGER,
ADD COLUMN     "apcExpiresAt" TIMESTAMP(3),
ADD COLUMN     "apcNumber" TEXT,
ADD COLUMN     "tcmRegistrationNo" TEXT;

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "doctorId" TEXT,
    "treatmentType" "TreatmentType",
    "basis" "CommissionBasis" NOT NULL,
    "rate" DECIMAL(10,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionRule_branchId_active_idx" ON "CommissionRule"("branchId", "active");

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

