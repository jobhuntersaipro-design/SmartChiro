-- CreateEnum
CREATE TYPE "OutreachType" AS ENUM ('RECALL', 'REVIEW');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingConsentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BranchReminderSettings" ADD COLUMN     "googleReviewUrl" TEXT,
ADD COLUMN     "recallAfterDays" INTEGER NOT NULL DEFAULT 42,
ADD COLUMN     "recallCooldownDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "recallDailyLimit" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "recallEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewCooldownDays" INTEGER NOT NULL DEFAULT 180,
ADD COLUMN     "reviewDelayHours" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "reviewEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PatientOutreach" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "OutreachType" NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "status" "OutreachStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "externalId" TEXT,
    "failureReason" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "appointmentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientOutreach_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientOutreach_branchId_type_status_scheduledFor_idx" ON "PatientOutreach"("branchId", "type", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "PatientOutreach_patientId_type_createdAt_idx" ON "PatientOutreach"("patientId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "PatientOutreach_status_scheduledFor_idx" ON "PatientOutreach"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "PatientOutreach_externalId_idx" ON "PatientOutreach"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientOutreach_appointmentId_type_key" ON "PatientOutreach"("appointmentId", "type");

-- AddForeignKey
ALTER TABLE "PatientOutreach" ADD CONSTRAINT "PatientOutreach_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientOutreach" ADD CONSTRAINT "PatientOutreach_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientOutreach" ADD CONSTRAINT "PatientOutreach_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

