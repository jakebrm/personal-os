-- Reading tracker

CREATE TABLE IF NOT EXISTS books (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text        NOT NULL DEFAULT 'owner',
  title         text        NOT NULL,
  author        text,
  cover_url     text,
  status        text        NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('reading', 'done', 'queued')),
  started_at    date,
  finished_at   date,
  rating        int         CHECK (rating BETWEEN 1 AND 5),
  notes         text,
  pages         int,
  pages_read    int         NOT NULL DEFAULT 0,
  sort_order    int         NOT NULL DEFAULT 0,
  -- Updated to today whenever pages_read changes; drives Read habit auto-sync
  progress_date date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE books ENABLE ROW LEVEL SECURITY;

-- Service role has full access (single-user personal OS)
CREATE POLICY "service role full access" ON books
  USING (true)
  WITH CHECK (true);
