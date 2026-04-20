-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "areasAdjusted" TEXT,
ADD COLUMN     "bloodPressureDia" INTEGER,
ADD COLUMN     "bloodPressureSys" INTEGER,
ADD COLUMN     "chiefComplaint" TEXT,
ADD COLUMN     "heartRate" INTEGER,
ADD COLUMN     "nextVisitDays" INTEGER,
ADD COLUMN     "recommendations" TEXT,
ADD COLUMN     "referrals" TEXT,
ADD COLUMN     "subluxationFindings" TEXT,
ADD COLUMN     "techniqueUsed" TEXT,
ADD COLUMN     "temperature" DOUBLE PRECISION,
ADD COLUMN     "visitType" TEXT,
ADD COLUMN     "weight" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "VisitQuestionnaire" (
    "id" TEXT NOT NULL,
    "painLevel" INTEGER NOT NULL,
    "mobilityScore" INTEGER NOT NULL,
    "sleepQuality" INTEGER NOT NULL,
    "dailyFunction" INTEGER NOT NULL,
    "overallImprovement" INTEGER NOT NULL,
    "patientComments" TEXT,
    "visitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitQuestionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitQuestionnaire_visitId_key" ON "VisitQuestionnaire"("visitId");

-- CreateIndex
CREATE INDEX "Visit_visitType_idx" ON "Visit"("visitType");

-- AddForeignKey
ALTER TABLE "VisitQuestionnaire" ADD CONSTRAINT "VisitQuestionnaire_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
