/*
  Warnings:

  - You are about to drop the column `calibrationEnabled` on the `Branch` table. All the data in the column will be lost.
  - You are about to drop the column `defaultPixelSpacing` on the `Branch` table. All the data in the column will be lost.
  - You are about to drop the column `calibrationMethod` on the `Xray` table. All the data in the column will be lost.
  - You are about to drop the column `isCalibrated` on the `Xray` table. All the data in the column will be lost.
  - You are about to drop the column `pixelSpacing` on the `Xray` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Branch" DROP COLUMN "calibrationEnabled",
DROP COLUMN "defaultPixelSpacing";

-- AlterTable
ALTER TABLE "Xray" DROP COLUMN "calibrationMethod",
DROP COLUMN "isCalibrated",
DROP COLUMN "pixelSpacing";

-- DropEnum
DROP TYPE "CalibrationMethod";
