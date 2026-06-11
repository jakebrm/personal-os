import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

function monthBounds(month: string): { firstDay: string; lastDay: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split('-').map(Number);
  const firstDay = `${month}-01`;
  const lastDay  = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  return { firstDay, lastDay };
}

export async function GET(req: NextRequest) {
  const month = new URL(req.url).searchParams.get('month') ?? '';
  const bounds = monthBounds(month);
  if (!bounds) return NextResponse.json({ habits: [] });

  const { data } = await supabaseAdmin
    .from('habit_configs')
    .select('habits')
    .eq('user_id', 'owner')
    .lte('valid_from', bounds.firstDay)
    .gte('valid_to', bounds.lastDay)
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ habits: (data?.habits as string[]) ?? [] });
}

export async function PUT(req: NextRequest) {
  const month = new URL(req.url).searchParams.get('month') ?? '';
  const bounds = monthBounds(month);
  if (!bounds) return NextResponse.json({ error: 'Expected month=YYYY-MM' }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { habits?: unknown };
  const habits: string[] = Array.isArray(body.habits)
    ? (body.habits as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  // Delete existing config for this exact month then insert fresh
  await supabaseAdmin
    .from('habit_configs')
    .delete()
    .eq('user_id', 'owner')
    .eq('valid_from', bounds.firstDay)
    .eq('valid_to', bounds.lastDay);

  const { error } = await supabaseAdmin
    .from('habit_configs')
    .insert({ user_id: 'owner', habits, valid_from: bounds.firstDay, valid_to: bounds.lastDay });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ habits });
}
