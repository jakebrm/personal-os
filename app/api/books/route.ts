import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Book } from '@/lib/books';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('books')
    .select('*')
    .eq('user_id', 'owner')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ books: (data ?? []) as Book[] });
}

function todayStr(): string {
  const d = new Date();
  return (
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Partial<Book>;
  const { title, author, pages, status, cover_url, finished_at } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const { data: maxRow } = await supabaseAdmin
    .from('books')
    .select('sort_order')
    .eq('user_id', 'owner')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();

  const sort_order = (maxRow?.sort_order ?? -1) + 1;
  const resolvedStatus = status ?? 'queued';
  const resolvedFinishedAt = resolvedStatus === 'done'
    ? (finished_at || todayStr())
    : null;

  const { data, error } = await supabaseAdmin
    .from('books')
    .insert({
      user_id: 'owner',
      title: title.trim(),
      author: author?.trim() || null,
      pages: pages ?? null,
      status: resolvedStatus,
      cover_url: cover_url || null,
      sort_order,
      finished_at: resolvedFinishedAt,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ book: data as Book });
}
