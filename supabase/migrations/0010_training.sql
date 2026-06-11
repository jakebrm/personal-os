-- Training plans + denormalized workouts (TrainingPeaks-style calendar)

CREATE TABLE IF NOT EXISTS training_plans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  event_name  text,
  event_date  date,
  plan_start  date,
  plan_end    date,
  goal        text,
  plan_json   jsonb       NOT NULL,
  is_active   boolean     DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_workouts (
  id                 text        PRIMARY KEY,
  plan_id            uuid        REFERENCES training_plans(id) ON DELETE CASCADE,
  date               date        NOT NULL,
  day_of_week        text,
  week_number        int,
  phase              text,
  sport              text        NOT NULL,
  type               text,
  name               text        NOT NULL,
  description        text,
  human_readable     text,
  duration_minutes   int,
  distance_meters    numeric,
  primary_zone       text,
  completed          boolean     DEFAULT false,
  completed_at       timestamptz,
  notes              text,
  strava_activity_id text,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workouts_date  ON training_workouts(date);
CREATE INDEX IF NOT EXISTS idx_workouts_plan  ON training_workouts(plan_id);
CREATE INDEX IF NOT EXISTS idx_workouts_sport ON training_workouts(sport);
