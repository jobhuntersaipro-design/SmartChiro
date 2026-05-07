-- CreateEnum
CREATE TYPE "AppointmentAuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'RESCHEDULE', 'DOCTOR_REASSIGN', 'STATUS_CHANGE', 'NOTE_EDIT');

-- CreateEnum
CREATE TYPE "TreatmentType" AS ENUM ('INITIAL_CONSULT', 'ADJUSTMENT', 'GONSTEAD', 'DIVERSIFIED', 'ACTIVATOR', 'DROP_TABLE', 'SOFT_TISSUE', 'SPINAL_DECOMPRESSION', 'REHAB_EXERCISE', 'X_RAY', 'FOLLOW_UP', 'WELLNESS_CHECK', 'PEDIATRIC', 'PRENATAL', 'SPORTS_REHAB', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL_LEAVE', 'SICK_LEAVE', 'PERSONAL_LEAVE', 'CONFERENCE', 'JURY_DUTY', 'UNPAID_LEAVE', 'OTHER');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "treatmentType" "TreatmentType";

-- CreateTable
CREATE TABLE "AppointmentAuditLog" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "action" "AppointmentAuditAction" NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "actorName" TEXT,
    "patientNameAtEvent" TEXT NOT NULL,
    "dateTimeAtEvent" TIMESTAMP(3) NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorTimeOff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT,
    "type" "LeaveType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorBreakTime" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorBreakTime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentAuditLog_appointmentId_createdAt_idx" ON "AppointmentAuditLog"("appointmentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AppointmentAuditLog_actorId_idx" ON "AppointmentAuditLog"("actorId");

-- CreateIndex
CREATE INDEX "DoctorTimeOff_userId_idx" ON "DoctorTimeOff"("userId");

-- CreateIndex
CREATE INDEX "DoctorTimeOff_branchId_idx" ON "DoctorTimeOff"("branchId");

-- CreateIndex
CREATE INDEX "DoctorTimeOff_startDate_idx" ON "DoctorTimeOff"("startDate");

-- CreateIndex
CREATE INDEX "DoctorTimeOff_endDate_idx" ON "DoctorTimeOff"("endDate");

-- CreateIndex
CREATE INDEX "DoctorBreakTime_userId_branchId_dayOfWeek_idx" ON "DoctorBreakTime"("userId", "branchId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorBreakTime_userId_branchId_dayOfWeek_startMinute_key" ON "DoctorBreakTime"("userId", "branchId", "dayOfWeek", "startMinute");

-- AddForeignKey
ALTER TABLE "DoctorTimeOff" ADD CONSTRAINT "DoctorTimeOff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorTimeOff" ADD CONSTRAINT "DoctorTimeOff_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorBreakTime" ADD CONSTRAINT "DoctorBreakTime_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorBreakTime" ADD CONSTRAINT "DoctorBreakTime_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
