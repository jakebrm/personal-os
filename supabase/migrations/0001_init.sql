-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────
-- entities
-- ─────────────────────────────────────────────
CREATE TABLE entities (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL    DEFAULT now(),
  updated_at  timestamptz NOT NULL    DEFAULT now(),
  name        text        NOT NULL,
  type        text        NOT NULL,
  metadata    jsonb
);

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- raw_captures
-- ─────────────────────────────────────────────
CREATE TABLE raw_captures (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL    DEFAULT now(),
  entity_id   uuid        REFERENCES entities (id) ON DELETE SET NULL,
  source      text        NOT NULL,
  content     text,
  metadata    jsonb
);

ALTER TABLE raw_captures ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- tasks
-- ─────────────────────────────────────────────
CREATE TABLE tasks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL    DEFAULT now(),
  updated_at  timestamptz NOT NULL    DEFAULT now(),
  entity_id   uuid        REFERENCES entities (id) ON DELETE SET NULL,
  title       text        NOT NULL,
  description text,
  status      text        NOT NULL    DEFAULT 'pending',
  due_date    timestamptz,
  metadata    jsonb
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- daily_logs
-- ─────────────────────────────────────────────
CREATE TABLE daily_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date    date        NOT NULL,
  created_at  timestamptz NOT NULL    DEFAULT now(),
  entity_id   uuid        REFERENCES entities (id) ON DELETE SET NULL,
  content     text,
  metadata    jsonb
);

ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- memory_chunks
-- ─────────────────────────────────────────────
CREATE TABLE memory_chunks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL    DEFAULT now(),
  entity_id   uuid        REFERENCES entities (id) ON DELETE CASCADE,
  content     text        NOT NULL,
  embedding   vector(1536),
  metadata    jsonb
);

CREATE INDEX memory_chunks_embedding_idx
  ON memory_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE memory_chunks ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- audit_log
-- ─────────────────────────────────────────────
CREATE TABLE audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL    DEFAULT now(),
  table_name  text        NOT NULL,
  record_id   uuid,
  operation   text        NOT NULL    CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  actor       uuid,
  old_data    jsonb,
  new_data    jsonb
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
