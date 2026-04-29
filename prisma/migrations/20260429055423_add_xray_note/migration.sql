-- CreateTable
CREATE TABLE "XrayNote" (
    "id" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "xrayId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XrayNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "XrayNote_xrayId_createdAt_idx" ON "XrayNote"("xrayId", "createdAt");

-- CreateIndex
CREATE INDEX "XrayNote_authorId_idx" ON "XrayNote"("authorId");

-- AddForeignKey
ALTER TABLE "XrayNote" ADD CONSTRAINT "XrayNote_xrayId_fkey" FOREIGN KEY ("xrayId") REFERENCES "Xray"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XrayNote" ADD CONSTRAINT "XrayNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
