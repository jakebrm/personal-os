-- ── match_memory_chunks ────────────────────────────────────────────
-- Cosine similarity search using ivfflat index.
-- personal-os schema: content (not text), metadata JSONB holds source_type/source_id.
create or replace function match_memory_chunks(
  query_embedding vector(1536),
  match_threshold float default 0.25,
  match_count int default 20
)
returns table (
  id          uuid,
  entity_id   uuid,
  content     text,
  created_at  timestamptz,
  metadata    jsonb,
  similarity  float
)
language sql stable
as $$
  select
    id,
    entity_id,
    content,
    created_at,
    metadata,
    1 - (embedding <=> query_embedding) as similarity
  from memory_chunks
  where embedding is not null
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ── memory_stats ───────────────────────────────────────────────────
-- Aggregate counts, source breakdown, and date range for the Brain UI.
create or replace function memory_stats()
returns table (
  total      bigint,
  by_source  jsonb,
  oldest     timestamptz,
  newest     timestamptz
)
language sql stable
as $$
  select
    (select count(*) from memory_chunks where embedding is not null)::bigint,
    coalesce(
      (select jsonb_object_agg(src, cnt)
       from (
         select
           coalesce(metadata->>'source_type', 'unknown') as src,
           count(*) as cnt
         from memory_chunks
         where embedding is not null
         group by src
       ) s),
      '{}'::jsonb
    ),
    (select min(created_at) from memory_chunks where embedding is not null),
    (select max(created_at) from memory_chunks where embedding is not null);
$$;
