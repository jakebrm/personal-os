import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { homeDateStr } from '@/lib/dates';

// Starfit webhook — ready to receive weight data when Starfit exposes an API.
// Authenticate via STARFIT_WEBHOOK_SECRET in the Authorization header.
export async function POST(req: Request) {
  const secret = process.env.STARFIT_WEBHOOK_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await req.json();

  // Expected payload: { date, weight_kg, body_fat_pct }
  const date        = body.date ?? homeDateStr();
  const weight_lbs  = body.weight_kg ? body.weight_kg * 2.20462 : body.weight_lbs;
  const body_fat_pct = body.body_fat_pct ?? null;

  if (!weight_lbs) {
    return NextResponse.json({ error: 'Missing weight' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('body_logs').insert({
    user_id: 'owner', date, weight_lbs, body_fat_pct, source: 'starfit',
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
