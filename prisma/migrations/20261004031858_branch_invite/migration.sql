-- CreateTable
CREATE TABLE "BranchInvite" (
    "id" TEXT NOT NULL,
    "role" "BranchRole" NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchInvite_userId_branchId_key" ON "BranchInvite"("userId", "branchId");

-- AddForeignKey
ALTER TABLE "BranchInvite" ADD CONSTRAINT "BranchInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchInvite" ADD CONSTRAINT "BranchInvite_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
