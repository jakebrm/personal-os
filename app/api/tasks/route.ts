import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { rowToTask, type Task } from '@/lib/tasks';
import { embedFireAndForget } from '@/lib/embed';

export type { Task };

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tasks: (data ?? []).map(rowToTask) });
  } catch (e) {
    console.error('[GET /api/tasks]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      title?: string;
      urgency?: string;
      description?: string;
      due_date?: string;
    };

    const title = body.title?.trim();
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

    const urgency = body.urgency ?? 'today';
    const now     = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert({
        title,
        description: body.description ?? null,
        status:      'pending',
        due_date:    body.due_date ?? null,
        metadata:    { urgency },
        created_at:  now,
        updated_at:  now,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const task = rowToTask(data as Record<string, unknown>);
    embedFireAndForget({ content: title, sourceType: 'task', sourceId: task.id });
    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    console.error('[POST /api/tasks]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
