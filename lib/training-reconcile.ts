import type { SupabaseClient } from '@supabase/supabase-js';
import { HOME_TZ } from './dates';

// Auto-complete planned training from logged activity.
// If Garmin/Intervals records an activity whose sport matches a planned
// training_workouts row on the same day (lift → strength, run → run, …),
// the plan item is marked completed automatically. One matching activity
// completes every same-sport plan item that day. Idempotent — only rows
// with completed=false are touched, manual completions are never undone.

const SPORT_MATCH: Record<string, RegExp> = {
  run:      /run/i,                       // Run, VirtualRun, TrailRun
  strength: /weight|strength|gym/i,       // WeightTraining
  bike:     /ride|bike|cycl/i,
  swim:     /swim/i,
  walk:     /walk|hike/i,
};

// Ignore sub-10-minute blips (auto-detected strolls etc.)
const MIN_ACTIVITY_MIN = 10;

const TZ = HOME_TZ;
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

type PlannedRow  = { id: string; date: string; sport: string | null };
type ActivityRow = { date: string; type: string | null; duration_min: number | null };

export async function autoCompleteTraining(sb: SupabaseClient, windowDays = 7): Promise<number> {
  try {
    const today = dayKey(new Date());
    const since = dayKey(new Date(Date.now() - windowDays * 86_400_000));

    const { data: planned } = await sb
      .from('training_workouts')
      .select('id, date, sport')
      .eq('completed', false)
      .neq('sport', 'rest')
      .gte('date', since)
      .lte('date', today);
    if (!planned || planned.length === 0) return 0;

    const { data: acts } = await sb
      .from('workouts')
      .select('date, type, duration_min')
      .eq('user_id', 'owner')
      .gte('date', since)
      .lte('date', today);
    if (!acts || acts.length === 0) return 0;

    const byDay = new Map<string, ActivityRow[]>();
    for (const a of acts as ActivityRow[]) {
      const list = byDay.get(a.date) ?? [];
      list.push(a);
      byDay.set(a.date, list);
    }

    const doneIds: string[] = [];
    for (const w of planned as PlannedRow[]) {
      const re = SPORT_MATCH[(w.sport ?? '').toLowerCase()];
      if (!re) continue;
      const hit = (byDay.get(w.date) ?? []).some(a =>
        re.test(a.type ?? '') && (a.duration_min ?? 0) >= MIN_ACTIVITY_MIN);
      if (hit) doneIds.push(w.id);
    }
    if (doneIds.length === 0) return 0;

    await sb
      .from('training_workouts')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .in('id', doneIds);

    return doneIds.length;
  } catch {
    return 0;
  }
}
