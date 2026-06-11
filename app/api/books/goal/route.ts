import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const GOAL_TYPE = 'reading_goal';

type GoalEntity = { id: string; name: string; metadata: { goal: number; year: number } | null };

function goalName(year: number) {
  return `reading_goal_${year}`;
}

export async function GET(req: NextRequest) {
  const year = parseInt(new URL(req.url).searchParams.get('year') ?? String(new Date().getFullYear()), 10);

  const { data } = await supabaseAdmin
    .from('entities')
    .select('id, name, metadata')
    .eq('type', GOAL_TYPE)
    .eq('name', goalName(year))
    .maybeSingle<GoalEntity>();

  return NextResponse.json({ goal: data?.metadata?.goal ?? 24, year });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { goal?: number; year?: number };
  const year = body.year ?? new Date().getFullYear();
  const goal = typeof body.goal === 'number' ? Math.max(1, body.goal) : 24;

  const { data: existing } = await supabaseAdmin
    .from('entities')
    .select('id')
    .eq('type', GOAL_TYPE)
    .eq('name', goalName(year))
    .maybeSingle<{ id: string }>();

  if (existing) {
    await supabaseAdmin
      .from('entities')
      .update({ metadata: { goal, year }, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabaseAdmin
      .from('entities')
      .insert({ type: GOAL_TYPE, name: goalName(year), metadata: { goal, year } });
  }

  return NextResponse.json({ ok: true, goal, year });
}
