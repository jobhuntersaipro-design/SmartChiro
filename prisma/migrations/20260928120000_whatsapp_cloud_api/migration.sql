-- CreateEnum
CREATE TYPE "WhatsAppConnectionType" AS ENUM ('COEXISTENCE', 'EMBEDDED_SIGNUP', 'MANUAL');

-- CreateEnum
CREATE TYPE "WhatsAppAccountStatus" AS ENUM ('CONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "WhatsAppAccount" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayPhoneNumber" TEXT,
    "verifiedName" TEXT,
    "connectionType" "WhatsAppConnectionType" NOT NULL,
    "status" "WhatsAppAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastError" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "registrationPinEnc" TEXT,
    "templateName" TEXT NOT NULL,
    "templateStatus" JSONB NOT NULL,
    "templatesCheckedAt" TIMESTAMP(3),
    "connectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAccount_branchId_key" ON "WhatsAppAccount"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAccount_phoneNumberId_key" ON "WhatsAppAccount"("phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsAppAccount_wabaId_idx" ON "WhatsAppAccount"("wabaId");

-- AddForeignKey
ALTER TABLE "WhatsAppAccount" ADD CONSTRAINT "WhatsAppAccount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

