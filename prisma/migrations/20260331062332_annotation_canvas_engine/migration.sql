/*
  Warnings:

  - You are about to drop the column `thumbnail` on the `Annotation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Annotation" DROP COLUMN "thumbnail",
ADD COLUMN     "canvasStateSize" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "imageAdjustments" JSONB,
ADD COLUMN     "thumbnailUrl" TEXT;
