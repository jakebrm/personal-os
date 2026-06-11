import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type AppleWellness = {
  date: string; sleep_score?: number; sleep_duration_min?: number;
  sleep_deep_min?: number; sleep_light_min?: number; sleep_rem_min?: number;
  sleep_awake_min?: number; hrv?: number; resting_hr?: number; vo2_max?: number;
  respiration_rate?: number; spo2?: number;
};
type AppleWorkout = {
  date: string; type: string; name?: string; duration_min?: number;
  distance_m?: number; calories?: number; avg_hr?: number;
};
type AppleDailyStats = {
  date: string; steps?: number; floors?: number; active_calories?: number;
  total_calories?: number; active_minutes?: number;
};

export async function POST(req: Request) {
  const body = await req.json() as {
    wellness?: AppleWellness[];
    workouts?: AppleWorkout[];
    daily_stats?: AppleDailyStats[];
  };

  const supabase = getSupabaseAdmin();
  let inserted = 0, skipped = 0;

  if (body.wellness?.length) {
    const dates = body.wellness.map(w => w.date);
    const { data: existing } = await supabase
      .from('wellness_logs')
      .select('date')
      .eq('user_id', 'owner')
      .eq('source', 'garmin')
      .in('date', dates);
    const garminDates = new Set((existing ?? []).map(r => r.date));

    const toInsert = body.wellness
      .filter(w => !garminDates.has(w.date))
      .map(w => ({ ...w, user_id: 'owner', source: 'apple' as const }));

    if (toInsert.length > 0) {
      await supabase.from('wellness_logs').upsert(toInsert, { onConflict: 'date,user_id' });
      inserted += toInsert.length;
    }
    skipped += body.wellness.length - toInsert.length;
  }

  if (body.workouts?.length) {
    const toInsert = body.workouts.map(w => ({ ...w, user_id: 'owner', source: 'apple' as const }));
    await supabase.from('workouts').insert(toInsert);
    inserted += toInsert.length;
  }

  if (body.daily_stats?.length) {
    const dates = body.daily_stats.map(d => d.date);
    const { data: existing } = await supabase
      .from('daily_stats')
      .select('date')
      .eq('user_id', 'owner')
      .eq('source', 'garmin')
      .in('date', dates);
    const garminDates = new Set((existing ?? []).map(r => r.date));

    const toInsert = body.daily_stats
      .filter(d => !garminDates.has(d.date))
      .map(d => ({ ...d, user_id: 'owner', source: 'apple' }));

    if (toInsert.length > 0) {
      await supabase.from('daily_stats').upsert(toInsert, { onConflict: 'date,user_id' });
      inserted += toInsert.length;
    }
    skipped += body.daily_stats.length - toInsert.length;
  }

  return NextResponse.json({ inserted, skipped });
}
