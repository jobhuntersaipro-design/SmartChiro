-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN "passwordSetByOther" BOOLEAN NOT NULL DEFAULT false;
