-- CreateTable
CREATE TABLE "AiLandmarkCorrection" (
    "id" TEXT NOT NULL,
    "xrayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "landmarkName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "aiX" DOUBLE PRECISION NOT NULL,
    "aiY" DOUBLE PRECISION NOT NULL,
    "finalX" DOUBLE PRECISION NOT NULL,
    "finalY" DOUBLE PRECISION NOT NULL,
    "imageWidth" INTEGER NOT NULL,
    "imageHeight" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiLandmarkCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiLandmarkCorrection_landmarkName_idx" ON "AiLandmarkCorrection"("landmarkName");

-- CreateIndex
CREATE INDEX "AiLandmarkCorrection_userId_idx" ON "AiLandmarkCorrection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AiLandmarkCorrection_xrayId_landmarkName_key" ON "AiLandmarkCorrection"("xrayId", "landmarkName");

-- AddForeignKey
ALTER TABLE "AiLandmarkCorrection" ADD CONSTRAINT "AiLandmarkCorrection_xrayId_fkey" FOREIGN KEY ("xrayId") REFERENCES "Xray"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiLandmarkCorrection" ADD CONSTRAINT "AiLandmarkCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
