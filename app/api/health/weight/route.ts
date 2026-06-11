import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { homeDateStr } from '@/lib/dates';

export async function GET() {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('body_logs')
    .select('*')
    .eq('user_id', 'owner')
    .gte('date', since)
    .order('date', { ascending: true })
    // Same-day rows (manual + scale sync): newest last so clients can dedupe by keeping the last per date
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const { weight_lbs, body_fat_pct, notes, date } = await req.json();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('body_logs')
    .insert({
      user_id:     'owner',
      date:        date ?? homeDateStr(),
      weight_lbs,
      body_fat_pct: body_fat_pct ?? null,
      notes:        notes ?? null,
      source:       'manual',
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
