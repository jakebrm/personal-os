import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type InboxContact = {
  id: string;
  external_id: string;
  name: string;
  nickname: string | null;
  organization: string | null;
  phones: string[];
  emails: string[];
  birthday: string | null;
  city: string | null;
  status: 'pending' | 'dismissed' | 'imported';
  friend_id: string | null;
};

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('contact_inbox')
    .select('id, external_id, name, nickname, organization, phones, emails, birthday, city, status, friend_id')
    .eq('user_id', 'owner')
    .order('name', { ascending: true })
    .range(0, 9999);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const contacts = (data ?? []) as InboxContact[];
  const counts = { pending: 0, dismissed: 0, imported: 0 };
  for (const c of contacts) counts[c.status]++;

  return NextResponse.json({ contacts, counts });
}
