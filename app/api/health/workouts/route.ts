import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { syncIntervalsActivities } from '@/lib/intervals-sync';

export async function GET() {
  const supabase = getSupabaseAdmin();

  // Sync first (respects 15-min TTL)
  await syncIntervalsActivities(supabase).catch(() => {});

  const now    = new Date();
  const oldest = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const newest = now.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('workouts')
    .select('id, date, type, name, duration_min, distance_m, calories, avg_hr')
    .eq('user_id', 'owner')
    .gte('date', oldest)
    .lte('date', newest)
    .order('date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
