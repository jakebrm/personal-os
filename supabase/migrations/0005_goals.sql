-- Goals system

CREATE TABLE IF NOT EXISTS goals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text        NOT NULL DEFAULT 'owner',
  title          text        NOT NULL,
  description    text,
  category       text        NOT NULL DEFAULT 'custom'
                             CHECK (category IN ('health','reading','habits','fitness','finance','custom')),
  timeframe      text        NOT NULL DEFAULT 'monthly'
                             CHECK (timeframe IN ('daily','weekly','monthly','yearly','custom')),
  target_value   numeric     NOT NULL,
  target_unit    text,
  start_date     date,
  end_date       date,
  metric_source  text        NOT NULL DEFAULT 'manual'
                             CHECK (metric_source IN ('manual','books','habits','wellness_logs','strava_activities','daily_stats','nutrition_logs')),
  metric_field   text,
  metric_filter  jsonb,
  status         text        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','completed','abandoned')),
  color          text        NOT NULL DEFAULT 'oklch(0.76 0.065 255)',
  icon           text        NOT NULL DEFAULT '🎯',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goal_progress (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id    uuid        NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  date       date        NOT NULL,
  value      numeric     NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS goal_progress_goal_date ON goal_progress(goal_id, date);

ALTER TABLE goals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_progress  ENABLE ROW LEVEL SECURITY;
