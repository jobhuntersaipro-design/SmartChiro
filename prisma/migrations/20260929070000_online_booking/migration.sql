-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('STAFF', 'ONLINE');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "bookingDoctorIds" TEXT[],
ADD COLUMN     "bookingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bookingHorizonDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "bookingLeadMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "bookingNote" TEXT,
ADD COLUMN     "bookingSlotMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "bookingSlug" TEXT,
ADD COLUMN     "bookingTreatments" "TreatmentType"[];

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "source" "AppointmentSource" NOT NULL DEFAULT 'STAFF';

-- CreateIndex
CREATE UNIQUE INDEX "Branch_bookingSlug_key" ON "Branch"("bookingSlug");

