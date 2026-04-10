-- ============================================================
-- Migration: Restructure Clinic → Branch, new role system
-- ============================================================

-- 1. Create new BranchRole enum
CREATE TYPE "BranchRole" AS ENUM ('OWNER', 'ADMIN', 'DOCTOR');

-- 2. Rename CalibrationMethod value CLINIC_DEFAULT → BRANCH_DEFAULT
ALTER TYPE "CalibrationMethod" RENAME VALUE 'CLINIC_DEFAULT' TO 'BRANCH_DEFAULT';

-- 3. Rename Clinic table → Branch
ALTER TABLE "Clinic" RENAME TO "Branch";

-- 4. Rename ClinicMember table → BranchMember
ALTER TABLE "ClinicMember" RENAME TO "BranchMember";

-- 5. Rename columns in BranchMember: clinicId → branchId
ALTER TABLE "BranchMember" RENAME COLUMN "clinicId" TO "branchId";

-- 6. Rename constraints and indexes on BranchMember (before role swap, keep data intact)
ALTER TABLE "BranchMember" DROP CONSTRAINT IF EXISTS "ClinicMember_userId_clinicId_key";
ALTER TABLE "BranchMember" ADD CONSTRAINT "BranchMember_userId_branchId_key" UNIQUE ("userId", "branchId");

DROP INDEX IF EXISTS "ClinicMember_userId_idx";
DROP INDEX IF EXISTS "ClinicMember_clinicId_idx";
CREATE INDEX "BranchMember_userId_idx" ON "BranchMember"("userId");
CREATE INDEX "BranchMember_branchId_idx" ON "BranchMember"("branchId");

-- 7. Update BranchMember foreign keys
ALTER TABLE "BranchMember" DROP CONSTRAINT IF EXISTS "ClinicMember_userId_fkey";
ALTER TABLE "BranchMember" DROP CONSTRAINT IF EXISTS "ClinicMember_clinicId_fkey";
ALTER TABLE "BranchMember" ADD CONSTRAINT "BranchMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchMember" ADD CONSTRAINT "BranchMember_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. Rename PK constraint on BranchMember
ALTER TABLE "BranchMember" DROP CONSTRAINT IF EXISTS "ClinicMember_pkey";
ALTER TABLE "BranchMember" ADD CONSTRAINT "BranchMember_pkey" PRIMARY KEY ("id");

-- 9. Patient table: rename clinicId → branchId, add doctorId
ALTER TABLE "Patient" RENAME COLUMN "clinicId" TO "branchId";
ALTER TABLE "Patient" ADD COLUMN "doctorId" TEXT;

-- Backfill doctorId BEFORE swapping the BranchMember role column (so data is still accessible)
UPDATE "Patient" p
SET "doctorId" = COALESCE(
  (SELECT bm."userId" FROM "BranchMember" bm WHERE bm."branchId" = p."branchId" ORDER BY bm."createdAt" ASC LIMIT 1),
  (SELECT bm."userId" FROM "BranchMember" bm ORDER BY bm."createdAt" ASC LIMIT 1)
);

-- Make doctorId NOT NULL
ALTER TABLE "Patient" ALTER COLUMN "doctorId" SET NOT NULL;

-- Add FK and index for doctorId
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Patient_doctorId_idx" ON "Patient"("doctorId");

-- Update Patient FK for branchId
ALTER TABLE "Patient" DROP CONSTRAINT IF EXISTS "Patient_clinicId_fkey";
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "Patient_clinicId_idx";
CREATE INDEX "Patient_branchId_idx" ON "Patient"("branchId");

-- 10. NOW swap the BranchMember role column (old ClinicRole → new BranchRole)
-- Drop old ClinicRole column, add new BranchRole column
ALTER TABLE "BranchMember" DROP COLUMN "role";
ALTER TABLE "BranchMember" ADD COLUMN "role" "BranchRole" NOT NULL DEFAULT 'DOCTOR';
CREATE INDEX "BranchMember_role_idx" ON "BranchMember"("role");

-- 11. Visit table: add proper doctorId FK (was just a string)
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 12. Appointment table: rename clinicId → branchId, add doctorId FK
ALTER TABLE "Appointment" RENAME COLUMN "clinicId" TO "branchId";

ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_clinicId_fkey";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "Appointment_clinicId_idx";
CREATE INDEX "Appointment_branchId_idx" ON "Appointment"("branchId");

-- 13. Invoice table: rename clinicId → branchId
ALTER TABLE "Invoice" RENAME COLUMN "clinicId" TO "branchId";

ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_clinicId_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "Invoice_clinicId_idx";
CREATE INDEX "Invoice_branchId_idx" ON "Invoice"("branchId");

-- 14. Xray table: add uploadedBy FK (was just a string column)
ALTER TABLE "Xray" ADD CONSTRAINT "Xray_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Xray_uploadedById_idx" ON "Xray"("uploadedById");

-- 15. Annotation table: add createdBy FK (was just a string column)
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 16. User table: rename activeClinicId → activeBranchId, drop role column
ALTER TABLE "User" RENAME COLUMN "activeClinicId" TO "activeBranchId";
ALTER TABLE "User" DROP COLUMN "role";

-- 17. Drop old enums
DROP TYPE IF EXISTS "GlobalRole";
DROP TYPE IF EXISTS "ClinicRole";

-- 18. Rename Clinic PK constraint
ALTER TABLE "Branch" RENAME CONSTRAINT "Clinic_pkey" TO "Branch_pkey";
