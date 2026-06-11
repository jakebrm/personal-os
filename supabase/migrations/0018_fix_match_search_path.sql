-- 0016 pinned match_memory_chunks to search_path = public, but pgvector is
-- installed in the `extensions` schema, so the <=> operator stopped resolving
-- and Brain semantic search 500'd. Keep the pin (still no privilege escalation
-- vector) but include extensions.
ALTER FUNCTION public.match_memory_chunks(vector, double precision, integer)
  SET search_path = public, extensions;
