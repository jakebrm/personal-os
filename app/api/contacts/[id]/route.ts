import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { computeFields } from '../../friends/route';

const TIER_DAYS: Record<string, number> = { close: 14, good: 35, acquaintance: 70, professional: 140 };

/**
 * Triage one inbox contact.
 * Body: { action: 'dismiss' } | { action: 'restore' } | { action: 'label', tier }
 * 'label' creates a `friends` row from the contact card and links it.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json() as { action: string; tier?: string };

  if (body.action === 'dismiss' || body.action === 'restore') {
    const status = body.action === 'dismiss' ? 'dismissed' : 'pending';
    const { data, error } = await supabaseAdmin
      .from('contact_inbox')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contact: data });
  }

  if (body.action === 'label') {
    const tier = body.tier ?? '';
    if (!(tier in TIER_DAYS)) return NextResponse.json({ error: 'invalid tier' }, { status: 400 });

    const { data: contact, error: cErr } = await supabaseAdmin
      .from('contact_inbox')
      .select('*')
      .eq('id', id)
      .single();
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

    const { data: friend, error: fErr } = await supabaseAdmin
      .from('friends')
      .insert({
        name: contact.name,
        nickname: contact.nickname,
        relationship: tier === 'professional' ? 'colleague' : 'friend',
        phone: (contact.phones as string[])[0] ?? null,
        email: (contact.emails as string[])[0] ?? null,
        birthday: contact.birthday,
        city: contact.city,
        tier,
        contact_frequency_days: TIER_DAYS[tier],
      })
      .select()
      .single();
    if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });

    const { data: updated, error: uErr } = await supabaseAdmin
      .from('contact_inbox')
      .update({ status: 'imported', friend_id: friend.id })
      .eq('id', id)
      .select()
      .single();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

    return NextResponse.json({
      contact: updated,
      friend: computeFields(friend as Record<string, unknown>),
    });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
