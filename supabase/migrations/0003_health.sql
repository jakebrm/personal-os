-- Health & Wellness tables

CREATE TABLE IF NOT EXISTS wellness_logs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date                date        NOT NULL,
  user_id             text        NOT NULL DEFAULT 'owner',
  sleep_score         int,
  sleep_duration_min  int,
  sleep_deep_min      int,
  sleep_light_min     int,
  sleep_rem_min       int,
  sleep_awake_min     int,
  hrv                 numeric,
  resting_hr          int,
  vo2_max             numeric,
  body_battery        int,
  respiration_rate    numeric,
  spo2                numeric,
  stress              int,
  source              text        CHECK (source IN ('garmin','apple')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, user_id)
);

CREATE TABLE IF NOT EXISTS strava_activities (
  id          bigint      PRIMARY KEY,
  user_id     text        NOT NULL DEFAULT 'owner',
  name        text,
  sport_type  text,
  distance_m  numeric,
  duration_sec int,
  elevation_m numeric,
  avg_hr      int,
  max_hr      int,
  calories    int,
  date        date        NOT NULL,
  source      text        DEFAULT 'strava',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workouts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text        NOT NULL DEFAULT 'owner',
  type         text,
  name         text,
  duration_min int,
  distance_m   numeric,
  calories     int,
  avg_hr       int,
  date         date        NOT NULL,
  source       text        CHECK (source IN ('apple','strava','manual')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_stats (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date            date        NOT NULL,
  user_id         text        NOT NULL DEFAULT 'owner',
  steps           int,
  floors          int,
  active_calories int,
  total_calories  int,
  active_minutes  int,
  source          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, user_id)
);

CREATE TABLE IF NOT EXISTS body_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date         date        NOT NULL,
  user_id      text        NOT NULL DEFAULT 'owner',
  weight_lbs   numeric,
  body_fat_pct numeric,
  notes        text,
  source       text        CHECK (source IN ('manual','starfit')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS biomarkers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date            date        NOT NULL,
  user_id         text        NOT NULL DEFAULT 'owner',
  test_source     text,
  marker_name     text        NOT NULL,
  value           numeric,
  unit            text,
  reference_low   numeric,
  reference_high  numeric,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nutrition_logs (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date      date        NOT NULL,
  user_id   text        NOT NULL DEFAULT 'owner',
  calories  int,
  protein_g numeric,
  carbs_g   numeric,
  fat_g     numeric,
  fiber_g   numeric,
  water_ml  int,
  source    text        CHECK (source IN ('macrofactor','manual')),
  meals     jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, user_id)
);

ALTER TABLE wellness_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE strava_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats       ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE biomarkers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_logs    ENABLE ROW LEVEL SECURITY;
