import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { homeDateStr } from '@/lib/dates';

// Returns which habits should be auto-completed today based on external data.
// sleep:    wellness_logs shows >= 420 min (7 hrs) of sleep for today
// read:     any book has progress_date === today
// exercise: any Strava activity or Garmin/Intervals workout logged today
//
// Client passes ?date=YYYY-MM-DD (local clock) to avoid UTC/local mismatch —
// wellness logs are stored with Intervals.icu local dates, not UTC server time.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const today = searchParams.get('date') ?? homeDateStr();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return NextResponse.json({ sleep: false, read: false, exercise: false });
  }

  const [wellnessResult, booksResult, stravaResult, workoutsResult] = await Promise.all([
    supabaseAdmin
      .from('wellness_logs')
      .select('sleep_duration_min')
      .eq('user_id', 'owner')
      .eq('date', today)
      .maybeSingle<{ sleep_duration_min: number | null }>(),

    supabaseAdmin
      .from('books')
      .select('id')
      .eq('user_id', 'owner')
      .eq('progress_date', today)
      .limit(1),

    supabaseAdmin
      .from('strava_activities')
      .select('id')
      .eq('user_id', 'owner')
      .eq('date', today)
      .limit(1),

    supabaseAdmin
      .from('workouts')
      .select('date')
      .eq('user_id', 'owner')
      .eq('date', today)
      .limit(1),
  ]);

  const sleepMin = wellnessResult.data?.sleep_duration_min ?? null;
  const sleep    = sleepMin !== null && sleepMin >= 420;
  const read     = (booksResult.data?.length ?? 0) > 0;
  const exercise = (stravaResult.data?.length ?? 0) > 0 || (workoutsResult.data?.length ?? 0) > 0;

  return NextResponse.json({ sleep, read, exercise });
}
