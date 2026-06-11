-- Strava sends fractional values (average_heartrate: 82.7, calories: 432.1) but
-- these columns were integer. PostgREST casts JSON numbers through text, so one
-- fractional value failed the whole 60-row upsert batch (22P02) — and the sync
-- swallowed the error, leaving strava_activities permanently empty.

ALTER TABLE strava_activities
  ALTER COLUMN avg_hr   TYPE numeric,
  ALTER COLUMN max_hr   TYPE numeric,
  ALTER COLUMN calories TYPE numeric;
