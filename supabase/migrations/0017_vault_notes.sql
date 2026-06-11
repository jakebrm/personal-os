-- Obsidian vault mirror. Synced from the local vault by scripts/sync-vault.ts;
-- full note bodies live here, semantic chunks go to memory_chunks
-- (source_type 'vault_note', source_id = path).
CREATE TABLE vault_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path         text NOT NULL UNIQUE,          -- vault-relative, e.g. "6 - Main Notes/Future.md"
  title        text NOT NULL,                 -- filename without .md
  folder       text NOT NULL DEFAULT '',      -- vault-relative dir, '' for root
  tags         text[] NOT NULL DEFAULT '{}',
  content      text NOT NULL,
  content_hash text NOT NULL,                 -- sha256 of content, drives incremental sync
  file_mtime   timestamptz,
  synced_at    timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vault_notes_folder_idx ON vault_notes (folder);

-- Service-role-only app: RLS on, zero policies (see 0016_lockdown_rls.sql)
ALTER TABLE vault_notes ENABLE ROW LEVEL SECURITY;
