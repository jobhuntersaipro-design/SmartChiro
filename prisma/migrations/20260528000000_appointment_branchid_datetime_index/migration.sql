-- Composite index for the calendar window query: every list call filters
-- by (branchId AND dateTime BETWEEN start AND end) together. With only
-- single-column indexes on branchId and dateTime, Postgres picks one and
-- scans the rest. The composite lets the planner serve the whole predicate
-- from one index.
CREATE INDEX IF NOT EXISTS "Appointment_branchId_dateTime_idx"
  ON "Appointment" ("branchId", "dateTime");
