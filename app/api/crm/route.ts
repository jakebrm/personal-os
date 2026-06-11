import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type CrmStage = 'lead' | 'contacted' | 'proposal' | 'active' | 'won' | 'lost';

export type CrmContact = {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  source: string | null;
  notes: string | null;
  stage: CrmStage;
  value_usd: number;
  next_action: string | null;
  next_action_date: string | null;
  last_touch_at: string | null;
  created_at: string;
  updated_at: string;
  // computed
  days_since_touch: number | null;
  action_due: boolean;
};

export function computeCrmFields(row: Record<string, unknown>): CrmContact {
  const last = row.last_touch_at as string | null;
  const nextDate = row.next_action_date as string | null;
  const today = new Intl.DateTimeFormat('en-CA').format(new Date());

  let days_since: number | null = null;
  if (last) {
    const ms = Date.now() - new Date(last + 'T12:00:00').getTime();
    days_since = Math.max(0, Math.floor(ms / 86_400_000));
  }

  return {
    ...(row as Omit<CrmContact, 'days_since_touch' | 'action_due'>),
    days_since_touch: days_since,
    action_due: Boolean(nextDate && nextDate <= today),
  };
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('crm_contacts')
    .select('*')
    .eq('user_id', 'owner')
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: (data ?? []).map(c => computeCrmFields(c as Record<string, unknown>)) });
}

export async function POST(req: Request) {
  const body = await req.json() as Partial<CrmContact>;
  const { name, company, role, email, phone, instagram, source, notes,
          stage, value_usd, next_action, next_action_date } = body;

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('crm_contacts')
    .insert({
      name,
      company: company ?? null, role: role ?? null,
      email: email ?? null, phone: phone ?? null, instagram: instagram ?? null,
      source: source ?? null, notes: notes ?? null,
      stage: stage ?? 'lead',
      value_usd: value_usd ?? 0,
      next_action: next_action ?? null,
      next_action_date: next_action_date ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: computeCrmFields(data as Record<string, unknown>) });
}
