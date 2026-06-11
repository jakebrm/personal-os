import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type CrmActivity = {
  id: string;
  contact_id: string;
  user_id: string;
  date: string;
  type: 'call' | 'email' | 'dm' | 'meeting' | 'shoot' | 'delivery' | 'invoice' | 'note';
  notes: string | null;
  created_at: string;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from('crm_activities')
    .select('*')
    .eq('contact_id', id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activities: data ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json() as Partial<CrmActivity>;
  const date = body.date ?? new Intl.DateTimeFormat('en-CA').format(new Date());

  const { data, error } = await supabaseAdmin
    .from('crm_activities')
    .insert({
      contact_id: id,
      date,
      type: body.type ?? 'note',
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Logging an activity counts as touching the client.
  await supabaseAdmin
    .from('crm_contacts')
    .update({ last_touch_at: date })
    .eq('id', id);

  return NextResponse.json({ activity: data });
}
