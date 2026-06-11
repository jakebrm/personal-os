-- Daily Log: 1–5 mood rating on journal entries (set from the Notes composer)

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS mood smallint CHECK (mood BETWEEN 1 AND 5);
