-- CreateEnum
CREATE TYPE "BranchAuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "BranchAuditLog" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "action" "BranchAuditAction" NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "actorName" TEXT,
    "branchNameAtEvent" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchAuditLog_branchId_createdAt_idx" ON "BranchAuditLog"("branchId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BranchAuditLog_actorId_idx" ON "BranchAuditLog"("actorId");
