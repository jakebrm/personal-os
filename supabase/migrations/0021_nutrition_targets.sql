-- Weekly nutrition parameters set by the nutritionist skill (Sunday check-in).
-- One row per week; the dashboard Fuel card picks the latest row with
-- week_start <= today and flexes the day's kcal/carb target by day type
-- (rest / lift / run / double) detected from planned + actual training.

CREATE TABLE IF NOT EXISTS nutrition_targets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL DEFAULT 'owner',
  week_start  date        NOT NULL,
  weight_lb   numeric,                  -- anchor weight the math was run at
  goal        text        NOT NULL DEFAULT 'lean-bulk'
                          CHECK (goal IN ('cut','maintain','lean-bulk')),
  protein_g   int         NOT NULL,     -- fixed all week (1 g/lb rule)
  fat_g       int         NOT NULL,     -- fixed all week
  water_ml    int         NOT NULL DEFAULT 3785,  -- the gallon habit
  kcal_rest   int         NOT NULL,
  kcal_lift   int         NOT NULL,
  kcal_run    int         NOT NULL,
  kcal_double int         NOT NULL,
  carbs_rest  int,
  carbs_lift  int,
  carbs_run   int,
  carbs_double int,
  rationale   text,                     -- the "why" from the weekly check-in
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start, user_id)
);

ALTER TABLE nutrition_targets ENABLE ROW LEVEL SECURITY;
