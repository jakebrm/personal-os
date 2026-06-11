import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as { content?: string; mood?: number | null };
  const hasContent = typeof body.content === 'string';
  const hasMood    = 'mood' in body;
  if (!hasContent && !hasMood) {
    return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });
  }
  if (hasMood && body.mood != null && !(body.mood >= 1 && body.mood <= 5)) {
    return NextResponse.json({ error: 'mood must be 1–5' }, { status: 400 });
  }

  // Merge with the existing row so a mood-only save never wipes content (and
  // vice versa) — upserting partial fields would null the others.
  const { data: existing } = await supabaseAdmin
    .from('journal_entries')
    .select('content, mood')
    .eq('user_id', 'owner')
    .eq('date', date)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from('journal_entries')
    .upsert(
      {
        user_id: 'owner',
        date,
        content: hasContent ? (body.content ?? '') : (existing?.content ?? ''),
        mood:    hasMood ? body.mood : (existing?.mood ?? null),
      },
      { onConflict: 'user_id,date' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
