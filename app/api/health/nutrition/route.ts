import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { homeDateStr } from '@/lib/dates';

export async function GET() {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('nutrition_logs')
    .select('*')
    .eq('user_id', 'owner')
    .gte('date', since)
    .order('date', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const body = await req.json();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nutrition_logs')
    .upsert({
      user_id:   'owner',
      date:      body.date ?? homeDateStr(),
      calories:  body.calories  ?? null,
      protein_g: body.protein_g ?? null,
      carbs_g:   body.carbs_g   ?? null,
      fat_g:     body.fat_g     ?? null,
      fiber_g:   body.fiber_g   ?? null,
      water_ml:  body.water_ml  ?? null,
      source:    body.source    ?? 'manual',
      meals:     body.meals     ?? null,
    }, { onConflict: 'date,user_id' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
