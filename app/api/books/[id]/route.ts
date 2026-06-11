import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Book } from '@/lib/books';

function todayStr(): string {
  const d = new Date();
  return (
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({})) as Partial<Book> & { pages_read?: number };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.title === 'string')       patch.title       = body.title.trim();
  if (typeof body.author === 'string')      patch.author      = body.author.trim() || null;
  if (typeof body.pages === 'number')       patch.pages       = body.pages;
  if (typeof body.status === 'string')      patch.status      = body.status;
  if (typeof body.rating === 'number')      patch.rating      = body.rating;
  if (body.rating === null)                 patch.rating      = null;
  if (typeof body.notes === 'string')       patch.notes       = body.notes;
  if (typeof body.sort_order === 'number')  patch.sort_order  = body.sort_order;
  if (typeof body.cover_url === 'string')   patch.cover_url   = body.cover_url || null;
  if (typeof body.started_at === 'string')  patch.started_at  = body.started_at || null;
  if (typeof body.finished_at === 'string' || body.finished_at === null) patch.finished_at = body.finished_at || null;

  if (typeof body.pages_read === 'number') {
    patch.pages_read    = body.pages_read;
    patch.progress_date = todayStr();
  }

  // Auto-timestamps on status changes
  if (body.status === 'reading' && !body.started_at) patch.started_at  = todayStr();
  if (body.status === 'done'    && !body.finished_at) patch.finished_at = todayStr();

  const { data, error } = await supabaseAdmin
    .from('books')
    .update(patch)
    .eq('id', id)
    .eq('user_id', 'owner')
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ book: data as Book });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { error } = await supabaseAdmin
    .from('books')
    .delete()
    .eq('id', id)
    .eq('user_id', 'owner');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
