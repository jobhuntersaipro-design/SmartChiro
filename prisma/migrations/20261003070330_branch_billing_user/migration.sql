-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "billingUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_billingUserId_fkey" FOREIGN KEY ("billingUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: each existing branch is billed to its earliest OWNER (the founder in practice).
UPDATE "Branch" b
SET "billingUserId" = (
  SELECT m."userId" FROM "BranchMember" m
  WHERE m."branchId" = b."id" AND m."role" = 'OWNER'
  ORDER BY m."createdAt" ASC
  LIMIT 1
)
WHERE b."billingUserId" IS NULL;
