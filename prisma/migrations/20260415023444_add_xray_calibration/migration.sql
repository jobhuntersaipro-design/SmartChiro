-- AlterTable
ALTER TABLE "Xray" ADD COLUMN     "calibrationNote" TEXT,
ADD COLUMN     "isCalibrated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pixelsPerMm" DOUBLE PRECISION;
