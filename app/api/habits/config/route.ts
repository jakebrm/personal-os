import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { HabitDef } from '@/lib/habits';

// Stored as a row in `entities` (already exists, no migration needed)
const CONFIG_TYPE = 'habit_config';
const CONFIG_NAME = 'user_habit_config';

type EntityRow = { id: string; metadata: { habits?: HabitDef[] } | null };

export async function GET() {
  const { data } = await supabaseAdmin
    .from('entities')
    .select('id, metadata')
    .eq('type', CONFIG_TYPE)
    .maybeSingle<EntityRow>();

  if (!data) return NextResponse.json({ habits: null });
  return NextResponse.json({ habits: data.metadata?.habits ?? null });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { habits?: unknown };

  if (!Array.isArray(body.habits)) {
    return NextResponse.json({ error: 'habits must be an array' }, { status: 400 });
  }

  const habits = (body.habits as unknown[])
    .filter((h): h is HabitDef =>
      typeof h === 'object' && h !== null &&
      typeof (h as HabitDef).id === 'string' &&
      typeof (h as HabitDef).label === 'string',
    );

  const { data: existing } = await supabaseAdmin
    .from('entities')
    .select('id')
    .eq('type', CONFIG_TYPE)
    .maybeSingle<{ id: string }>();

  if (existing) {
    await supabaseAdmin
      .from('entities')
      .update({ metadata: { habits }, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabaseAdmin
      .from('entities')
      .insert({ type: CONFIG_TYPE, name: CONFIG_NAME, metadata: { habits } });
  }

  return NextResponse.json({ ok: true });
}
