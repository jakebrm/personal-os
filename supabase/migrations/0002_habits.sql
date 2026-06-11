-- Add notes column for structured daily log data (habits, journal, etc.)
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS notes jsonb;

-- Unique constraint on log_date so we can upsert by date
-- (one row per calendar day; personal OS has a single user)
ALTER TABLE daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_log_date_unique;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_log_date_unique UNIQUE (log_date);
