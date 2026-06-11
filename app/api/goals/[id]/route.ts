import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { computeGoalProgress } from '@/lib/goals/computeProgress';
import type { Goal } from '@/lib/goals';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id }  = await ctx.params;
  const body    = await req.json().catch(() => ({})) as Partial<Goal>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.title === 'string')         patch.title         = body.title.trim();
  if (typeof body.description === 'string')   patch.description   = body.description;
  if (typeof body.category === 'string')      patch.category      = body.category;
  if (typeof body.timeframe === 'string')     patch.timeframe     = body.timeframe;
  if (typeof body.target_value === 'number')  patch.target_value  = body.target_value;
  if (typeof body.target_unit === 'string')   patch.target_unit   = body.target_unit;
  if (typeof body.start_date === 'string')    patch.start_date    = body.start_date || null;
  if (typeof body.end_date === 'string')      patch.end_date      = body.end_date || null;
  if (typeof body.metric_source === 'string') patch.metric_source = body.metric_source;
  if (typeof body.metric_field === 'string' || body.metric_field === null) patch.metric_field = body.metric_field;
  if (body.metric_filter !== undefined)       patch.metric_filter = body.metric_filter;
  if (typeof body.status === 'string')        patch.status        = body.status;
  if (typeof body.color === 'string')         patch.color         = body.color;
  if (typeof body.icon === 'string')          patch.icon          = body.icon;

  const { data, error } = await supabaseAdmin
    .from('goals')
    .update(patch)
    .eq('id', id)
    .eq('user_id', 'owner')
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const goal = data as Goal;
  let progress = {};
  try { progress = await computeGoalProgress(goal, supabaseAdmin); } catch {}
  return NextResponse.json({ goal: { ...goal, ...progress } });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { error } = await supabaseAdmin
    .from('goals')
    .delete()
    .eq('id', id)
    .eq('user_id', 'owner');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
