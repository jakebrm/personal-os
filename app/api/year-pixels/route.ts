import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { homeDateStr } from '@/lib/dates';

// Year in Pixels — one intensity level per day, composed from habit
// completion (daily_logs) and training (workouts). No external calls.
//
//   level -1  future / no data
//   level  0  logged day, nothing done
//   level 1-4 habit ratio (0–3 pts) + worked out (1 pt), capped at 4

export type PixelDay = {
  date: string;          // YYYY-MM-DD
  level: number;         // -1..4
  habitsDone: number;
  habitsTotal: number;
  workout: boolean;
};

type LogRow = { log_date: string; notes: { habits?: { done?: string[] } } | null };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year  = parseInt(searchParams.get('year') ?? '', 10) || new Date().getFullYear();
  const start = `${year}-01-01`;
  const end   = `${year}-12-31`;

  const [logsRes, workoutsRes, configRes] = await Promise.all([
    supabaseAdmin.from('daily_logs').select('log_date, notes').gte('log_date', start).lte('log_date', end),
    supabaseAdmin.from('workouts').select('date').eq('user_id', 'owner').gte('date', start).lte('date', end),
    supabaseAdmin.from('habit_configs').select('id'),
  ]);

  if (logsRes.error) return NextResponse.json({ error: logsRes.error.message }, { status: 500 });

  const habitsTotal = Math.max(1, (configRes.data ?? []).length);
  const workoutDays = new Set(((workoutsRes.data ?? []) as { date: string }[]).map(r => r.date));
  const doneByDate  = new Map<string, number>();
  for (const row of (logsRes.data ?? []) as LogRow[]) {
    doneByDate.set(row.log_date, (row.notes?.habits?.done ?? []).length);
  }

  const today = homeDateStr();
  const days: PixelDay[] = [];

  for (let m = 0; m < 12; m++) {
    const dim = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const date = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const done    = doneByDate.get(date) ?? 0;
      const workout = workoutDays.has(date);
      let level: number;
      if (date > today) level = -1;
      else if (done === 0 && !workout) level = doneByDate.has(date) ? 0 : -1;
      else {
        const pts = Math.min(3, (done / habitsTotal) * 3) + (workout ? 1 : 0);
        level = Math.max(1, Math.min(4, Math.round(pts)));
      }
      days.push({ date, level, habitsDone: done, habitsTotal, workout });
    }
  }

  return NextResponse.json({ year, days });
}
