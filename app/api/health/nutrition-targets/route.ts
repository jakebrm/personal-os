import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { homeDateStr } from '@/lib/dates';

export type DayType = 'rest' | 'lift' | 'run' | 'double';

export type NutritionTargets = {
  id: string;
  week_start: string;
  weight_lb: number | null;
  goal: 'cut' | 'maintain' | 'lean-bulk';
  protein_g: number;
  fat_g: number;
  water_ml: number;
  kcal_rest: number;
  kcal_lift: number;
  kcal_run: number;
  kcal_double: number;
  carbs_rest: number | null;
  carbs_lift: number | null;
  carbs_run: number | null;
  carbs_double: number | null;
  rationale: string | null;
};

/** Monday of the week containing `dateStr` (YYYY-MM-DD). */
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const shift = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - shift);
  return homeDateStr(d);
}

// GET → { current, history } — current is the latest week at or before today
export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nutrition_targets')
    .select('*')
    .eq('user_id', 'owner')
    .order('week_start', { ascending: false })
    .limit(12);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today   = homeDateStr();
  const rows    = (data ?? []) as NutritionTargets[];
  const current = rows.find(r => r.week_start <= today) ?? null;
  return NextResponse.json({ current, history: rows });
}

// POST → upsert the week's parameters (nutritionist skill, Sunday check-in)
export async function POST(req: Request) {
  const body = await req.json();
  const required = ['protein_g', 'fat_g', 'kcal_rest', 'kcal_lift', 'kcal_run', 'kcal_double'] as const;
  for (const k of required) {
    if (typeof body[k] !== 'number') {
      return NextResponse.json({ error: `missing/invalid ${k}` }, { status: 400 });
    }
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nutrition_targets')
    .upsert({
      user_id:      'owner',
      week_start:   body.week_start ?? mondayOf(homeDateStr()),
      weight_lb:    body.weight_lb    ?? null,
      goal:         body.goal         ?? 'lean-bulk',
      protein_g:    body.protein_g,
      fat_g:        body.fat_g,
      water_ml:     body.water_ml     ?? 3785,
      kcal_rest:    body.kcal_rest,
      kcal_lift:    body.kcal_lift,
      kcal_run:     body.kcal_run,
      kcal_double:  body.kcal_double,
      carbs_rest:   body.carbs_rest   ?? null,
      carbs_lift:   body.carbs_lift   ?? null,
      carbs_run:    body.carbs_run    ?? null,
      carbs_double: body.carbs_double ?? null,
      rationale:    body.rationale    ?? null,
    }, { onConflict: 'week_start,user_id' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
