import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTelegramMessage } from '@/lib/telegram';
import { composeBrief, chicagoToday } from '@/lib/brief';

// Send today's brief (at most once per day — morning_briefs dedupes).
// Triggered by the WakeTimeCard, an iOS/Garmin automation (x-api-secret),
// or manually. Body: { trigger?: string, force?: boolean }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { trigger?: string; force?: boolean };
  const today = chicagoToday();

  if (!body.force) {
    const { data } = await supabaseAdmin
      .from('morning_briefs').select('date').eq('date', today).maybeSingle();
    if (data) return NextResponse.json({ sent: false, reason: 'already sent today' });
  }

  const text = await composeBrief();
  await sendTelegramMessage(text);
  await supabaseAdmin.from('morning_briefs')
    .upsert({ date: today, sent_at: new Date().toISOString(), trigger: body.trigger ?? 'manual' });

  return NextResponse.json({ sent: true });
}
