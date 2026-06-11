-- Contact inbox — triage queue for contacts imported from the macOS address book.
-- Rows are upserted by scripts/sync-contacts.ts and triaged in the Friends deep:
-- labelling a contact creates a `friends` row; dismissing hides it from the queue.

CREATE TABLE IF NOT EXISTS contact_inbox (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text        NOT NULL DEFAULT 'owner',
  external_id  text        NOT NULL,            -- Contacts.app person id (stable across syncs)
  name         text        NOT NULL,
  nickname     text,
  organization text,
  phones       jsonb       NOT NULL DEFAULT '[]',
  emails       jsonb       NOT NULL DEFAULT '[]',
  birthday     date,                            -- year 1900 = month/day known, birth year not
  city         text,
  status       text        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','dismissed','imported')),
  friend_id    uuid        REFERENCES friends(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_inbox_status ON contact_inbox(user_id, status);

CREATE OR REPLACE FUNCTION set_contact_inbox_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_contact_inbox_updated_at ON contact_inbox;
CREATE TRIGGER trg_contact_inbox_updated_at
  BEFORE UPDATE ON contact_inbox
  FOR EACH ROW EXECUTE FUNCTION set_contact_inbox_updated_at();

-- Service-role-only app: deny-all RLS (no policies on purpose)
ALTER TABLE contact_inbox ENABLE ROW LEVEL SECURITY;
