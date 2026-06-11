import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { computeFields, type Friend } from '../../route';
import { homeDateStr } from '@/lib/dates';

export type Interaction = {
  id: string;
  friend_id: string;
  user_id: string;
  date: string;
  type: 'call' | 'text' | 'coffee' | 'dinner' | 'visit' | 'other';
  initiated_by: 'me' | 'them' | 'mutual';
  notes: string | null;
  created_at: string;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from('friend_interactions')
    .select('*')
    .eq('friend_id', id)
    .order('date', { ascending: false })
    .limit(1000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interactions: data ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: friend_id } = await params;
  const body = await req.json() as { type?: string; date?: string; notes?: string; initiated_by?: string };
  const type         = body.type         ?? 'other';
  const date         = body.date         ?? homeDateStr();
  const notes        = body.notes        ?? null;
  const initiated_by = body.initiated_by ?? 'me';

  const { data: inter, error: iErr } = await supabaseAdmin
    .from('friend_interactions')
    .insert({ friend_id, type, date, notes, initiated_by })
    .select()
    .single();
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  // Fetch current friend state
  const { data: current } = await supabaseAdmin
    .from('friends')
    .select('last_contacted_at, consecutive_me_count')
    .eq('id', friend_id)
    .single();

  const shouldUpdateDate = !current?.last_contacted_at || date >= current.last_contacted_at;
  const newCount = initiated_by === 'me'
    ? (current?.consecutive_me_count ?? 0) + 1
    : 0;

  const patch: Record<string, unknown> = { consecutive_me_count: newCount };
  if (shouldUpdateDate) patch.last_contacted_at = date;

  const { data: updated } = await supabaseAdmin
    .from('friends')
    .update(patch)
    .eq('id', friend_id)
    .select()
    .single();

  const friend: Friend | null = updated ? computeFields(updated as Record<string, unknown>) : null;
  return NextResponse.json({ interaction: inter, friend });
}
