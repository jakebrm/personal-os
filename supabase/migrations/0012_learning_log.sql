-- Learning Log — a time clock for self-directed learning (marketing agency).
-- Each row is one sit-down session: when it started + how long it ran + a note.
-- Feeds the Brain/Memory embedding pipeline so sessions are semantically searchable.

CREATE TABLE IF NOT EXISTS learning_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text        NOT NULL,
  started_at        timestamptz NOT NULL,                     -- when I got on the computer
  duration_minutes  integer     NOT NULL,                     -- session length in minutes
  note              text,                                     -- optional — what I worked on
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_log_duration_check CHECK (duration_minutes > 0)
);

-- Efficient time-ordered lookups per user
CREATE INDEX IF NOT EXISTS idx_learning_log_user_started ON learning_log(user_id, started_at);

ALTER TABLE learning_log ENABLE ROW LEVEL SECURITY;

-- Service role has full access (single-user personal OS)
CREATE POLICY "service role full access" ON learning_log
  USING (true)
  WITH CHECK (true);
