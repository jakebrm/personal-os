-- Allow a work_log entry to be tagged BOTH internal and client-facing, so a
-- single weekly Consulting entry can cover internal + client-facing work at once.

ALTER TABLE work_log DROP CONSTRAINT IF EXISTS work_log_visibility_check;
ALTER TABLE work_log ADD CONSTRAINT work_log_visibility_check
  CHECK (visibility IN ('internal','client_facing','both'));
