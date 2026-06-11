-- Morning brief — one row per day so wake-button + cron can't double-send

CREATE TABLE IF NOT EXISTS morning_briefs (
  date     date        PRIMARY KEY,
  sent_at  timestamptz NOT NULL DEFAULT now(),
  trigger  text                              -- 'wake' | 'garmin' | 'cron' | 'manual'
);
