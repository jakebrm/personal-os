import type { SupabaseClient } from '@supabase/supabase-js';
import { autoCompleteTraining } from '@/lib/training-reconcile';

let lastSyncMs = 0;
const SYNC_TTL = 15 * 60 * 1000;

type IntervalsActivity = {
  id:                string;
  name:              string;
  type:              string;
  start_date_local:  string;
  distance?:         number | null;
  moving_time?:      number | null;
  elapsed_time?:     number | null;
  calories?:         number | null;
  average_heartrate?: number | null;
};

export async function syncIntervalsActivities(
  supabase: SupabaseClient,
  force = false,
): Promise<IntervalsActivity[] | null> {
  const apiKey    = process.env.INTERVALS_API_KEY;
  const athleteId = process.env.INTERVALS_ATHLETE_ID;
  if (!apiKey || !athleteId) return null;
  if (!force && Date.now() - lastSyncMs < SYNC_TTL) return null;

  try {
    const oldest = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
    const newest = new Date().toISOString().slice(0, 10);
    const url    = `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${oldest}&newest=${newest}`;
    const auth   = Buffer.from(`API_KEY:${apiKey}`).toString('base64');

    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) throw new Error(`Intervals.icu activities: ${res.status}`);
    const activities: IntervalsActivity[] = await res.json();

    const rows = activities.map(a => ({
      user_id:      'owner',
      type:         a.type,
      name:         a.name,
      duration_min: Math.round(((a.moving_time ?? a.elapsed_time) ?? 0) / 60),
      distance_m:   a.distance ?? null,
      calories:     a.calories != null ? Math.round(a.calories) : null,
      avg_hr:       a.average_heartrate != null ? Math.round(a.average_heartrate) : null,
      date:         a.start_date_local.slice(0, 10),
      source:       'intervals' as const,
      external_id:  String(a.id),
    }));

    if (rows.length > 0) {
      await supabase.from('workouts').upsert(rows, { onConflict: 'source,external_id' });
      // Fresh activity may satisfy a planned training_workouts row today
      await autoCompleteTraining(supabase).catch(() => {});
    }

    lastSyncMs = Date.now();
    return activities;
  } catch {
    return null;
  }
}
