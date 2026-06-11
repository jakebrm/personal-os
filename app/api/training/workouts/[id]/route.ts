import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type Params = { params: Promise<{ id: string }> };

// Toggle completion or update notes on a single workout.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    completed?: boolean;
    notes?: string;
  };

  const patch: Record<string, unknown> = {};

  if (body.completed !== undefined) {
    patch.completed    = body.completed;
    patch.completed_at = body.completed ? new Date().toISOString() : null;
  }
  if (body.notes !== undefined) {
    patch.notes = body.notes;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('training_workouts')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workout: data });
}
