/**
 * Shared Strava sync logic.
 * Called by both /api/health/strava (user-facing) and the goals progress
 * computation (background) so goals never read a stale/empty table.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

// Module-level TTL — prevents re-hitting the Strava API more than once per 15 min
// even when multiple goals trigger the sync in the same server process.
let lastSyncMs = 0;
const SYNC_TTL = 15 * 60 * 1000;

function persistRefreshToken(token: string) {
  process.env.STRAVA_REFRESH_TOKEN = token;
  try {
    const path = join(process.cwd(), '.env.local');
    let content = readFileSync(path, 'utf8');
    if (/^STRAVA_REFRESH_TOKEN=.*/m.test(content)) {
      content = content.replace(/^STRAVA_REFRESH_TOKEN=.*/m, `STRAVA_REFRESH_TOKEN=${token}`);
    } else {
      content += `\nSTRAVA_REFRESH_TOKEN=${token}\n`;
    }
    writeFileSync(path, content, 'utf8');
  } catch { /* silently skip in read-only deploy envs */ }
}

export async function getStravaAccessToken(): Promise<string> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: process.env.STRAVA_REFRESH_TOKEN,
    }),
  });
  const data = await res.json() as {
    access_token?: string; refresh_token?: string; message?: string; errors?: unknown;
  };
  if (!res.ok || !data.access_token) {
    const detail = data.message ?? JSON.stringify(data.errors) ?? `HTTP ${res.status}`;
    throw Object.assign(new Error(`Strava token exchange failed: ${detail}`), { needsAuth: true });
  }
  if (data.refresh_token && data.refresh_token !== process.env.STRAVA_REFRESH_TOKEN) {
    persistRefreshToken(data.refresh_token);
  }
  return data.access_token;
}

type StravaRaw = {
  id: number; name: string; sport_type: string; distance: number;
  moving_time: number; total_elevation_gain: number; start_date_local: string;
  average_heartrate?: number; max_heartrate?: number; calories?: number;
  suffer_score?: number; average_speed?: number; max_speed?: number;
  average_cadence?: number; average_watts?: number;
  pr_count?: number; achievement_count?: number; kudos_count?: number;
};

/**
 * Fetch the 60 most recent Strava activities and upsert to strava_activities.
 * Returns the upserted rows, or null if Strava is not configured / auth failed.
 * Respects the 15-minute TTL — won't re-hit Strava if called again too soon.
 */
export async function syncStravaActivities(
  supabase: SupabaseClient,
  force = false,
): Promise<ReturnType<typeof mapRow>[] | null> {
  const cid = process.env.STRAVA_CLIENT_ID;
  const sec = process.env.STRAVA_CLIENT_SECRET;
  const rt  = process.env.STRAVA_REFRESH_TOKEN;
  if (!cid || !sec || !rt) return null;
  if (!force && Date.now() - lastSyncMs < SYNC_TTL) return null;

  try {
    const token = await getStravaAccessToken();
    const res   = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=60', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401) throw Object.assign(new Error('Strava auth expired'), { needsAuth: true });
      throw new Error(`Strava activities: ${res.status}`);
    }
    const raw: StravaRaw[] = await res.json();
    const rows = raw.map(mapRow);
    if (rows.length > 0) {
      const { error } = await supabase.from('strava_activities').upsert(rows, { onConflict: 'id' });
      // The API payload still serves the UI, but a persist failure must be loud —
      // a swallowed error here once left the table empty for weeks (int columns
      // rejecting Strava's fractional avg_hr).
      if (error) console.error('[strava-sync] upsert failed:', error.message);
    }
    lastSyncMs = Date.now();
    return rows;
  } catch (err) {
    const e = err as Error & { needsAuth?: boolean };
    if (e.needsAuth) throw e;
    return null;
  }
}

function mapRow(a: StravaRaw) {
  return {
    id:           a.id,
    user_id:      'owner',
    name:         a.name,
    sport_type:   a.sport_type,
    distance_m:   a.distance,
    duration_sec: a.moving_time,
    elevation_m:  a.total_elevation_gain,
    avg_hr:       a.average_heartrate ?? null,
    max_hr:       a.max_heartrate     ?? null,
    calories:     a.calories          ?? null,
    relative_effort:   a.suffer_score      ?? null,
    avg_speed_ms:      a.average_speed     ?? null,
    max_speed_ms:      a.max_speed         ?? null,
    avg_cadence:       a.average_cadence   ?? null,
    avg_watts:         a.average_watts     ?? null,
    pr_count:          a.pr_count          ?? 0,
    achievement_count: a.achievement_count ?? 0,
    kudos_count:       a.kudos_count       ?? 0,
    date:         a.start_date_local.slice(0, 10),
    source:       'strava' as const,
  };
}
