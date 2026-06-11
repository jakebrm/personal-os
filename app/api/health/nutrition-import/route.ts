import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// MacroFactor CSV format: Date,Calories,Protein,Carbs,Fat,Fiber
// Exact column names may vary — we match case-insensitively
export async function POST(req: Request) {
  const text = await req.text();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return NextResponse.json({ error: 'Empty CSV' }, { status: 400 });
  }

  const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
  const idx = (name: string) => headers.findIndex(h => h.includes(name));

  const dateIdx     = idx('date');
  const calIdx      = idx('calori');
  const proteinIdx  = idx('protein');
  const carbIdx     = idx('carb');
  const fatIdx      = idx('fat');
  const fiberIdx    = idx('fiber');

  if (dateIdx === -1) {
    return NextResponse.json({ error: 'No date column found' }, { status: 400 });
  }

  const rows = lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
    const num  = (i: number) => i !== -1 && cols[i] ? parseFloat(cols[i]) || null : null;
    return {
      user_id:   'owner',
      date:      cols[dateIdx],
      calories:  num(calIdx),
      protein_g: num(proteinIdx),
      carbs_g:   num(carbIdx),
      fat_g:     num(fatIdx),
      fiber_g:   num(fiberIdx),
      source:    'macrofactor' as const,
    };
  }).filter(r => r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date));

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid rows parsed' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('nutrition_logs')
    .upsert(rows, { onConflict: 'date,user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inserted: rows.length });
}
