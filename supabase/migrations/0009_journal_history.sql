-- Journal entries and habit config for handwritten journal import

CREATE TABLE IF NOT EXISTS journal_entries (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text        NOT NULL DEFAULT 'owner',
  date       date        NOT NULL,
  content    text,
  source     text        NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- Per-month habit list: which habits the user was tracking that month
CREATE TABLE IF NOT EXISTS habit_configs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text        NOT NULL DEFAULT 'owner',
  habits     jsonb       NOT NULL DEFAULT '[]',
  valid_from date        NOT NULL,
  valid_to   date        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS habit_configs_user_range
  ON habit_configs (user_id, valid_from, valid_to);

ALTER TABLE habit_configs ENABLE ROW LEVEL SECURITY;
