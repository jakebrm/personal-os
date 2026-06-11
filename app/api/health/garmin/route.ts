import { NextResponse } from 'next/server';
import { getSupabaseAdmin }        from '@/lib/supabase/admin';
import { syncIntervalsActivities } from '@/lib/intervals-sync';

let cache: { data: unknown; ts: number } | null = null;
const CACHE_MS = 15 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json(cache.data);
  }

  const apiKey    = process.env.INTERVALS_API_KEY;
  const athleteId = process.env.INTERVALS_ATHLETE_ID;
  if (!apiKey || !athleteId) {
    return NextResponse.json({ error: 'Intervals.icu not configured', wellness: [] }, { status: 503 });
  }

  try {
    const oldest = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
    const newest = new Date().toISOString().slice(0, 10);
    const url    = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness?oldest=${oldest}&newest=${newest}`;
    const auth   = Buffer.from(`API_KEY:${apiKey}`).toString('base64');

    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) throw new Error(`Intervals.icu: ${res.status}`);
    const wellness: WellnessDay[] = await res.json();

    // Map Intervals.icu camelCase → our snake_case WellnessRow format
    const rows = wellness.map(w => ({
      date:               w.id,
      user_id:            'owner',
      sleep_score:        w.sleepScore      ?? null,
      sleep_duration_min: w.sleepSecs       != null ? Math.round(w.sleepSecs / 60)       : null,
      sleep_deep_min:     w.sleepDeepSecs   != null ? Math.round(w.sleepDeepSecs / 60)   : null,
      sleep_light_min:    w.sleepLightSecs  != null ? Math.round(w.sleepLightSecs / 60)  : null,
      sleep_rem_min:      w.sleepRemSecs    != null ? Math.round(w.sleepRemSecs / 60)    : null,
      sleep_awake_min:    w.sleepAwakeSecs  != null ? Math.round(w.sleepAwakeSecs / 60)  : null,
      hrv:                w.hrv             ?? null,
      resting_hr:         w.restingHR       ?? null,
      vo2_max:            w.vo2max          ?? null,
      body_battery:       null,                      // not available via Intervals.icu
      respiration_rate:   w.respiration     ?? null,
      spo2:               w.spO2            ?? null,
      stress:             w.stress          ?? null,
      steps:              w.steps           ?? null,
      ctl:                w.ctl             ?? null,
      atl:                w.atl             ?? null,
      source:             'garmin' as const,
    }));

    const supabase = getSupabaseAdmin();
    if (rows.length > 0) {
      // Only upsert the subset of columns that exist in wellness_logs
      const dbRows = rows.map(({ steps: _s, ctl: _c, atl: _a, ...r }) => r);
      await supabase.from('wellness_logs').upsert(dbRows, { onConflict: 'date,user_id' });

      // Upsert steps to daily_stats (steps column only — other fields remain null)
      const stepRows = rows
        .filter(r => r.steps != null)
        .map(r => ({ date: r.date, user_id: r.user_id, steps: r.steps, source: 'garmin' }));
      if (stepRows.length > 0) {
        await supabase.from('daily_stats').upsert(stepRows, { onConflict: 'date,user_id' });
      }
    }

    // Also sync activities (workouts) in the background — don't block wellness response
    syncIntervalsActivities(supabase, true).catch(() => {});

    // Return the MAPPED rows (not the raw Intervals.icu data)
    cache = { data: rows, ts: Date.now() };
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err), wellness: [] }, { status: 500 });
  }
}

type WellnessDay = {
  id: string;
  sleepScore?: number | null;
  sleepSecs?: number | null;
  sleepDeepSecs?: number | null;
  sleepLightSecs?: number | null;
  sleepRemSecs?: number | null;
  sleepAwakeSecs?: number | null;
  hrv?: number | null;
  restingHR?: number | null;
  vo2max?: number | null;
  spO2?: number | null;
  respiration?: number | null;
  stress?: number | null;
  steps?: number | null;
  ctl?: number | null;
  atl?: number | null;
};
