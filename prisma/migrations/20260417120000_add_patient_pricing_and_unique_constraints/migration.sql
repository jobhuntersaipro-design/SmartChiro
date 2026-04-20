-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "initialTreatmentFee" DOUBLE PRECISION,
ADD COLUMN     "firstTreatmentFee" DOUBLE PRECISION,
ADD COLUMN     "standardFollowUpFee" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX "Patient_email_key" ON "Patient"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_icNumber_key" ON "Patient"("icNumber");
