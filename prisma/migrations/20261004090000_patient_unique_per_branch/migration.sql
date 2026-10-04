-- Patient email and IC are unique per branch, not across clinics (owner
-- decision D4): another clinic may treat the same person.
DROP INDEX IF EXISTS "Patient_email_key";
DROP INDEX IF EXISTS "Patient_icNumber_key";

-- One stored form for a MyKad: YYMMDD-PB-####. Rows whose canonical form
-- would collide with another patient in the same branch (the same person
-- entered with and without dashes) are left as they are for staff to merge.
WITH c AS (
  SELECT id, "branchId",
         regexp_replace("icNumber", '^(\d{6})-?(\d{2})-?(\d{4})$', '\1-\2-\3') AS canon
  FROM "Patient"
  WHERE "icNumber" ~ '^\d{6}-?\d{2}-?\d{4}$'
),
ok AS (
  SELECT canon, "branchId" FROM c GROUP BY canon, "branchId" HAVING count(*) = 1
)
UPDATE "Patient" p
SET "icNumber" = c.canon
FROM c JOIN ok USING (canon, "branchId")
WHERE p.id = c.id AND p."icNumber" <> c.canon;

CREATE UNIQUE INDEX "Patient_branchId_email_key" ON "Patient"("branchId", "email");
CREATE UNIQUE INDEX "Patient_branchId_icNumber_key" ON "Patient"("branchId", "icNumber");
