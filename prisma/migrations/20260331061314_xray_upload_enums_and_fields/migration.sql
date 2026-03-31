/*
  Warnings:

  - The `bodyRegion` column on the `Xray` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `viewType` column on the `Xray` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `uploadedById` to the `Xray` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "XrayStatus" AS ENUM ('UPLOADING', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BodyRegion" AS ENUM ('CERVICAL', 'THORACIC', 'LUMBAR', 'PELVIS', 'FULL_SPINE', 'EXTREMITY', 'OTHER');

-- CreateEnum
CREATE TYPE "ViewType" AS ENUM ('AP', 'LATERAL', 'OBLIQUE', 'PA', 'OTHER');

-- CreateEnum
CREATE TYPE "CalibrationMethod" AS ENUM ('CLINIC_DEFAULT', 'REFERENCE_MARKER', 'MANUAL');

-- AlterTable
ALTER TABLE "Xray" ADD COLUMN     "calibrationMethod" "CalibrationMethod",
ADD COLUMN     "status" "XrayStatus" NOT NULL DEFAULT 'UPLOADING',
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "uploadedById" TEXT NOT NULL,
DROP COLUMN "bodyRegion",
ADD COLUMN     "bodyRegion" "BodyRegion",
DROP COLUMN "viewType",
ADD COLUMN     "viewType" "ViewType";

-- CreateIndex
CREATE INDEX "Xray_status_idx" ON "Xray"("status");
