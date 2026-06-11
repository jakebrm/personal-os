import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// Shape of the coach-generated plan JSON (only the bits we read).
type PlanWorkout = {
  id: string;
  sport: string;
  type?: string;
  name: string;
  description?: string;
  humanReadable?: string;
  durationMinutes?: number;
  distanceMeters?: number;
  primaryZone?: string;
};
type PlanDay = { date: string; dayOfWeek?: string; workouts?: PlanWorkout[] };
type PlanWeek = { weekNumber: number; phase?: string; days?: PlanDay[] };
type PlanFile = {
  meta: {
    event?: string;
    eventDate?: string;
    planStartDate?: string;
    planEndDate?: string;
  };
  weeks: PlanWeek[];
};

const PLAN_FILE = 'red-white-blue-half-2026-07-18.json';

export async function POST() {
  const supabase = getSupabaseAdmin();

  let plan: PlanFile;
  try {
    const raw = readFileSync(join(process.cwd(), PLAN_FILE), 'utf8');
    plan = JSON.parse(raw) as PlanFile;
  } catch (e) {
    return NextResponse.json(
      { error: `Could not read ${PLAN_FILE}: ${String(e)}` },
      { status: 500 },
    );
  }

  const { meta, weeks } = plan;

  // ── Upsert the plan row (idempotent on event_name + event_date) ──────────────
  const planFields = {
    name:       meta.event ?? 'Training Plan',
    event_name: meta.event ?? null,
    event_date: meta.eventDate ?? null,
    plan_start: meta.planStartDate ?? null,
    plan_end:   meta.planEndDate ?? null,
    goal:       'Sub 1:50:00',
    plan_json:  plan as unknown as Record<string, unknown>,
    is_active:  true,
  };

  const { data: existing } = await supabase
    .from('training_plans')
    .select('id')
    .eq('event_name', planFields.event_name)
    .eq('event_date', planFields.event_date)
    .maybeSingle();

  let planId: string;
  if (existing?.id) {
    planId = existing.id;
    const { error } = await supabase
      .from('training_plans')
      .update(planFields)
      .eq('id', planId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data, error } = await supabase
      .from('training_plans')
      .insert(planFields)
      .select('id')
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
    }
    planId = data.id;
  }

  // ── Flatten weeks → days → workouts into denormalized rows ────────────────────
  const rows = weeks.flatMap(week =>
    (week.days ?? []).flatMap(day =>
      (day.workouts ?? []).map(w => ({
        id:               w.id,
        plan_id:          planId,
        date:             day.date,
        day_of_week:      day.dayOfWeek ?? null,
        week_number:      week.weekNumber,
        phase:            week.phase ?? null,
        sport:            w.sport,
        type:             w.type ?? null,
        name:             w.name,
        description:      w.description ?? null,
        human_readable:   w.humanReadable ?? null,
        duration_minutes: w.durationMinutes ?? null,
        distance_meters:  w.distanceMeters ?? null,
        primary_zone:     w.primaryZone ?? null,
      })),
    ),
  );

  // Upsert on workout id so re-running the seed never duplicates or clobbers
  // completion state for unchanged workouts. `completed`/`notes` are intentionally
  // omitted so a re-seed preserves whatever the athlete has logged.
  const { error: woError } = await supabase
    .from('training_workouts')
    .upsert(rows, { onConflict: 'id' });
  if (woError) return NextResponse.json({ error: woError.message }, { status: 500 });

  return NextResponse.json({ ok: true, planId, workouts: rows.length });
}
