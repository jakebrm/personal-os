import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('biomarkers')
    .select('*')
    .eq('user_id', 'owner')
    .order('date', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by date
  const byDate: Record<string, { date: string; test_source: string; markers: unknown[] }> = {};
  for (const row of data ?? []) {
    if (!byDate[row.date]) byDate[row.date] = { date: row.date, test_source: row.test_source, markers: [] };
    byDate[row.date].markers.push(row);
  }
  return NextResponse.json(Object.values(byDate));
}

export async function POST(req: Request) {
  const { date, test_source, markers } = await req.json() as {
    date: string; test_source: string;
    markers: Array<{ name: string; value: number; unit: string; reference_low?: number; reference_high?: number }>;
  };

  const supabase = getSupabaseAdmin();
  const rows = markers.map(m => ({
    user_id:       'owner',
    date,
    test_source,
    marker_name:   m.name,
    value:         m.value,
    unit:          m.unit,
    reference_low: m.reference_low  ?? null,
    reference_high: m.reference_high ?? null,
  }));

  const { data, error } = await supabase.from('biomarkers').insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
