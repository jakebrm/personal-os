import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { syncStravaActivities, getStravaAccessToken } from '@/lib/strava-sync';

let cache: { data: unknown; ts: number } | null = null;
const CACHE_MS = 15 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json(cache.data);
  }

  const cid = process.env.STRAVA_CLIENT_ID;
  const sec = process.env.STRAVA_CLIENT_SECRET;
  const rt  = process.env.STRAVA_REFRESH_TOKEN;
  if (!cid || !sec || !rt) {
    return NextResponse.json({ error: 'Strava not configured', needsAuth: true, activities: [] }, { status: 503 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const rows     = await syncStravaActivities(supabase, true); // force=true: always sync on direct health call
    if (rows === null) {
      // Credentials missing — already checked above, shouldn't reach here
      return NextResponse.json({ error: 'Strava sync failed', activities: [] }, { status: 500 });
    }
    cache = { data: rows, ts: Date.now() };
    return NextResponse.json(rows);
  } catch (err) {
    const e = err as Error & { needsAuth?: boolean };
    if (e.needsAuth) {
      cache = null;
      return NextResponse.json(
        { error: 'Strava authorization expired. Visit /api/health/strava/connect to reconnect.', needsAuth: true, activities: [] },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: e.message, needsAuth: false, activities: [] },
      { status: 500 }
    );
  }
}
