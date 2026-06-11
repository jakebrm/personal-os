-- Work Log — structured weekly record of work, tagged by client/project,
-- category and visibility. Feeds the Brain/Memory embedding pipeline so
-- entries are semantically searchable for reviews and interview prep.

CREATE TABLE IF NOT EXISTS work_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL,
  week_start      date        NOT NULL,                       -- Monday of the week (home timezone)
  client_project  text        NOT NULL,                       -- client or project name
  description     text        NOT NULL,                       -- what I did
  category        text        NOT NULL,                       -- delivery | leadership | process_improvement | relationship_building | learning | other
  impact          text,                                       -- optional outcome / impact notes
  visibility      text        NOT NULL DEFAULT 'internal',    -- internal | client_facing
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_log_category_check
    CHECK (category IN ('delivery','leadership','process_improvement','relationship_building','learning','other')),
  CONSTRAINT work_log_visibility_check
    CHECK (visibility IN ('internal','client_facing'))
);

-- Efficient weekly lookups per user
CREATE INDEX IF NOT EXISTS idx_work_log_user_week ON work_log(user_id, week_start);

ALTER TABLE work_log ENABLE ROW LEVEL SECURITY;

-- Service role has full access (single-user personal OS)
CREATE POLICY "service role full access" ON work_log
  USING (true)
  WITH CHECK (true);
