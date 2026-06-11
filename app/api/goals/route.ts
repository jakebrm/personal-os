import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { computeGoalProgress } from '@/lib/goals/computeProgress';
import type { Goal } from '@/lib/goals';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('goals')
    .select('*')
    .eq('user_id', 'owner')
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const goals = (data ?? []) as Goal[];
  const withProgress = await Promise.all(
    goals.map(async g => ({
      ...g,
      ...(await computeGoalProgress(g, supabaseAdmin)),
    }))
  );

  return NextResponse.json({ goals: withProgress });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Partial<Goal>;

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('goals')
    .insert({
      user_id:       'owner',
      title:         body.title.trim(),
      description:   body.description ?? null,
      category:      body.category ?? 'other',
      timeframe:     body.timeframe ?? 'monthly',
      target_value:  body.target_value ?? 1,
      target_unit:   body.target_unit ?? null,
      start_date:    body.start_date ?? null,
      end_date:      body.end_date ?? null,
      metric_source: body.metric_source ?? 'manual',
      metric_field:  body.metric_field ?? null,
      metric_filter: body.metric_filter ?? null,
      status:        'active',
      color:         body.color ?? 'var(--viz)',
      icon:          body.icon ?? '🎯',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const goal = data as Goal;

  // Compute progress separately so a data-query failure doesn't block the response
  let progress = {};
  try { progress = await computeGoalProgress(goal, supabaseAdmin); } catch {}

  return NextResponse.json({ goal: { ...goal, ...progress } }, { status: 201 });
}
