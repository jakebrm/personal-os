import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { homeDateStr } from '@/lib/dates';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({})) as {
    date?: string;
    value?: number;
    note?: string;
  };

  if (typeof body.value !== 'number') {
    return NextResponse.json({ error: 'value is required' }, { status: 400 });
  }

  const date = body.date ?? homeDateStr();

  const { data, error } = await supabaseAdmin
    .from('goal_progress')
    .insert({ goal_id: id, date, value: body.value, note: body.note ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data }, { status: 201 });
}
