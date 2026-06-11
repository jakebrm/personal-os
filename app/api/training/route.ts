import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { syncIntervalsActivities } from '@/lib/intervals-sync';
import { autoCompleteTraining } from '@/lib/training-reconcile';

// Returns the active training plan plus all its workouts (denormalized).
// The /training page filters by week client-side — the plan is small (~41 rows).
export async function GET() {
  const supabase = getSupabaseAdmin();

  // Pull any new Garmin/Intervals activity (TTL-guarded) and auto-mark plan
  // items it satisfies, so the calendar reflects tonight's lift/run on load.
  await syncIntervalsActivities(supabase).catch(() => {});
  await autoCompleteTraining(supabase).catch(() => {});

  const { data: plan, error: planErr } = await supabase
    .from('training_plans')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 });
  if (!plan)   return NextResponse.json({ plan: null, workouts: [] });

  const { data: workouts, error: woErr } = await supabase
    .from('training_workouts')
    .select('*')
    .eq('plan_id', plan.id)
    .order('date', { ascending: true });

  if (woErr) return NextResponse.json({ error: woErr.message }, { status: 500 });

  return NextResponse.json({ plan, workouts: workouts ?? [] });
}
