-- Security lockdown (Supabase advisor, 2026-06-08 email).
--
-- The app talks to Postgres exclusively through the server-side service-role
-- key, which BYPASSES row-level security. So the correct posture here is:
-- RLS enabled on every table, zero policies → anon/authenticated roles get
-- nothing, the app is unaffected.

-- 1. Tables that had RLS disabled entirely (the "critical" finding)
ALTER TABLE training_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_workouts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends             ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE morning_briefs      ENABLE ROW LEVEL SECURITY;

-- 2. Drop always-true policies that applied to ALL roles (these silently
--    re-opened the tables to anon; service role never needed them)
DROP POLICY IF EXISTS "service role full access" ON books;
DROP POLICY IF EXISTS "service role full access" ON learning_log;
DROP POLICY IF EXISTS "service role full access" ON work_log;

-- 3. Pin search_path on flagged functions (mutable search_path is a
--    privilege-escalation vector for SECURITY DEFINER / trigger functions)
ALTER FUNCTION public.memory_stats() SET search_path = public;
ALTER FUNCTION public.match_memory_chunks(vector, double precision, integer) SET search_path = public;
ALTER FUNCTION public.set_crm_contacts_updated_at() SET search_path = public;
ALTER FUNCTION public.set_friends_updated_at() SET search_path = public;
