import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { rowToTask } from '@/lib/tasks';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    title?: string;
    description?: string;
    due_date?: string | null;
    urgency?: string;
    sort_order?: number;
    status?: string;
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.title       !== undefined) patch.title       = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.due_date    !== undefined) patch.due_date    = body.due_date || null;
  if (body.status      !== undefined) patch.status      = body.status;

  // urgency and sort_order live inside metadata — merge so other keys are preserved
  if (body.urgency !== undefined || body.sort_order !== undefined) {
    const { data: cur } = await supabaseAdmin
      .from('tasks').select('metadata').eq('id', id).single();
    const meta = (cur?.metadata ?? {}) as Record<string, unknown>;
    if (body.urgency    !== undefined) meta.urgency    = body.urgency;
    if (body.sort_order !== undefined) meta.sort_order = body.sort_order;
    patch.metadata = meta;
  }

  const { data, error } = await supabaseAdmin
    .from('tasks').update(patch).eq('id', id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: rowToTask(data as Record<string, unknown>) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { error } = await supabaseAdmin.from('tasks').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
