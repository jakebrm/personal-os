-- Reply-time tracking (scripts/sync-comms.ts):
--   reply_median_minutes — median time they take to answer the owner's texts (90d window)
--   reply_samples        — how many replies that median is based on
--   awaiting_reply_since — the owner's first unanswered outbound text (NULL when the
--                          ball is in his court / conversation is settled)

ALTER TABLE friends
  ADD COLUMN IF NOT EXISTS reply_median_minutes integer,
  ADD COLUMN IF NOT EXISTS reply_samples integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS awaiting_reply_since timestamptz;
