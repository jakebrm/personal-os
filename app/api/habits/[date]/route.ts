import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Checking the Water habit fills the Fuel card's water bar: it writes that
 * day's target into nutrition_logs.water_ml. Never lowers a real synced value
 * (MacroFactor/Apple Health), and un-checking only clears the value if it's
 * exactly the one we wrote.
 */
async function syncWaterToNutrition(date: string, waterDone: boolean) {
  const { data: t } = await supabaseAdmin
    .from('nutrition_targets')
    .select('water_ml')
    .lte('week_start', date)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  const target = t?.water_ml ?? 3785;

  const { data: log } = await supabaseAdmin
    .from('nutrition_logs')
    .select('id, water_ml')
    .eq('user_id', 'owner')
    .eq('date', date)
    .maybeSingle();

  if (waterDone) {
    if ((log?.water_ml ?? 0) >= target) return;
    if (log) {
      await supabaseAdmin.from('nutrition_logs').update({ water_ml: target }).eq('id', log.id);
    } else {
      await supabaseAdmin.from('nutrition_logs')
        .insert({ user_id: 'owner', date, water_ml: target, source: 'habit' });
    }
  } else if (log && log.water_ml === target) {
    await supabaseAdmin.from('nutrition_logs').update({ water_ml: null }).eq('id', log.id);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as { done?: unknown };
  const done: string[] = Array.isArray(body.done)
    ? (body.done as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  // Read existing row to avoid clobbering other notes keys (Garmin data etc.)
  const { data: existing } = await supabaseAdmin
    .from('daily_logs')
    .select('id, notes')
    .eq('log_date', date)
    .maybeSingle();

  const existingNotes = (existing?.notes as Record<string, unknown>) ?? {};
  const prevDone = ((existingNotes.habits as { done?: string[] } | undefined)?.done) ?? [];
  const merged = { ...existingNotes, habits: { done } };

  const { error } = await supabaseAdmin
    .from('daily_logs')
    .upsert(
      { ...(existing?.id ? { id: existing.id } : {}), log_date: date, notes: merged },
      { onConflict: 'log_date' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const waterNow = done.includes('water');
  if (waterNow !== prevDone.includes('water')) {
    try { await syncWaterToNutrition(date, waterNow); } catch { /* never block the habit save */ }
  }

  return NextResponse.json({ ok: true, date, done });
}
