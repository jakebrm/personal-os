-- Capture richer Strava summary fields the sync previously discarded.
-- Same API call, more columns: relative effort (suffer score), speeds,
-- cadence, watts, and the social/achievement counters.
ALTER TABLE strava_activities
  ADD COLUMN IF NOT EXISTS relative_effort   numeric,
  ADD COLUMN IF NOT EXISTS avg_speed_ms      numeric,
  ADD COLUMN IF NOT EXISTS max_speed_ms      numeric,
  ADD COLUMN IF NOT EXISTS avg_cadence       numeric,
  ADD COLUMN IF NOT EXISTS avg_watts         numeric,
  ADD COLUMN IF NOT EXISTS pr_count          int,
  ADD COLUMN IF NOT EXISTS achievement_count int,
  ADD COLUMN IF NOT EXISTS kudos_count       int;
