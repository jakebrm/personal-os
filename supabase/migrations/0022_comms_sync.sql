-- Auto-logged communications: iMessage + call-history sync (scripts/sync-comms.ts)
--
-- friend_interactions gains:
--   source       — 'manual' (logged in UI) vs 'imessage'/'call_log' (auto-synced)
--   external_key — stable per (source, friend, day) so re-runs upsert instead of duplicating
--   meta         — counts from the sync (texts sent/received, calls in/out, duration…)

ALTER TABLE friend_interactions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'imessage', 'call_log')),
  ADD COLUMN IF NOT EXISTS external_key text,
  ADD COLUMN IF NOT EXISTS meta jsonb;

-- Full unique constraint (not partial) so PostgREST upsert can target it;
-- NULLs never collide, so manual rows are unaffected.
ALTER TABLE friend_interactions
  ADD CONSTRAINT friend_interactions_external_key_unique UNIQUE (external_key);

CREATE INDEX IF NOT EXISTS idx_interactions_source_date
  ON friend_interactions(source, date DESC);
