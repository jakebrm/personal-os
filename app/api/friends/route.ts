import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type Friend = {
  id: string;
  user_id: string;
  name: string;
  nickname: string | null;
  relationship: 'friend' | 'family' | 'colleague' | 'mentor' | 'other';
  phone: string | null;
  email: string | null;
  instagram: string | null;
  birthday: string | null;
  city: string | null;
  notes: string | null;
  photo_url: string | null;
  contact_frequency_days: number;
  last_contacted_at: string | null;
  tier: 'close' | 'good' | 'acquaintance' | 'professional';
  status: 'active' | 'cooling' | 'written_off';
  consecutive_me_count: number;
  reply_median_minutes: number | null;
  reply_samples: number;
  awaiting_reply_since: string | null;
  created_at: string;
  updated_at: string;
  // computed
  days_since_last_contact: number | null;
  overdue: boolean;
  days_overdue: number;
  days_awaiting_reply: number | null;
};

export function computeFields(row: Record<string, unknown>): Friend {
  const freq = (row.contact_frequency_days as number) ?? 30;
  const last = row.last_contacted_at as string | null;
  let days_since: number | null = null;
  let overdue = false;
  let days_overdue = 0;

  if (last) {
    const ms = Date.now() - new Date(last + 'T12:00:00').getTime();
    days_since = Math.floor(ms / 86_400_000);
    if (days_since > freq) {
      overdue = true;
      days_overdue = days_since - freq;
    }
  }

  const awaiting = row.awaiting_reply_since as string | null;
  const days_awaiting_reply = awaiting
    ? Math.floor((Date.now() - new Date(awaiting).getTime()) / 86_400_000)
    : null;

  return {
    ...(row as Omit<Friend, 'days_since_last_contact' | 'overdue' | 'days_overdue' | 'days_awaiting_reply'>),
    days_since_last_contact: days_since,
    overdue,
    days_overdue,
    days_awaiting_reply,
  };
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('friends')
    .select('*')
    .eq('user_id', 'owner')
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ friends: (data ?? []).map(f => computeFields(f as Record<string, unknown>)) });
}

export async function POST(req: Request) {
  const body = await req.json() as Partial<Friend>;
  const { name, nickname, relationship, phone, email, instagram,
          birthday, city, notes, contact_frequency_days } = body;

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('friends')
    .insert({
      name,
      nickname: nickname ?? null,
      relationship: relationship ?? 'friend',
      phone: phone ?? null, email: email ?? null, instagram: instagram ?? null,
      birthday: birthday ?? null, city: city ?? null, notes: notes ?? null,
      contact_frequency_days: contact_frequency_days ?? 30,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ friend: computeFields(data as Record<string, unknown>) });
}
