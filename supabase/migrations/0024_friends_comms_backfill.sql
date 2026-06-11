-- First-time comms backfill tracking (scripts/sync-comms.ts)
--
-- When a contact is imported from the inbox into friends, the next comms sync
-- should aggregate their ENTIRE iMessage/call history, not just the incremental
-- window. NULL comms_backfilled_at marks a friend as never backfilled; the sync
-- does a full-history pass for them and stamps this on success.

ALTER TABLE friends
  ADD COLUMN IF NOT EXISTS comms_backfilled_at timestamptz;
