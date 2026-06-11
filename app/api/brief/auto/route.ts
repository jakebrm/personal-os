import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTelegramMessage } from '@/lib/telegram';
import { composeBrief, chicagoToday } from '@/lib/brief';

// Cron entry point (public route; self-guarded by CRON_SECRET below).
//
// Default: send today's brief if it hasn't gone out yet.
// With ?require_signal=1 (for high-frequency crons on a Pro plan): only send
// once a wake signal exists — today's Garmin wellness sync landing in
// wellness_logs, or a wake time logged in daily_logs. That makes the Garmin
// morning report itself the trigger, no manual button needed.
export async function GET(req: NextRequest) {
  // Fail closed: without CRON_SECRET configured, nobody can trigger this.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const today = chicagoToday();
  const { data: already } = await supabaseAdmin
    .from('morning_briefs').select('date').eq('date', today).maybeSingle();
  if (already) return NextResponse.json({ sent: false, reason: 'already sent today' });

  // Wake signals — Garmin overnight sync or a logged wake time
  const [wellness, wake] = await Promise.all([
    supabaseAdmin.from('wellness_logs').select('date').eq('date', today).maybeSingle(),
    supabaseAdmin.from('daily_logs').select('notes').eq('log_date', today).maybeSingle(),
  ]);
  const wakeLogged = Boolean((wake.data?.notes as { wakeTime?: string } | null)?.wakeTime);
  const hasSignal  = Boolean(wellness.data) || wakeLogged;

  if (req.nextUrl.searchParams.get('require_signal') === '1' && !hasSignal) {
    return NextResponse.json({ sent: false, reason: 'no wake signal yet' });
  }

  const text = await composeBrief();
  await sendTelegramMessage(text);
  await supabaseAdmin.from('morning_briefs').upsert({
    date: today,
    sent_at: new Date().toISOString(),
    trigger: wakeLogged ? 'wake' : wellness.data ? 'garmin' : 'cron',
  });

  return NextResponse.json({ sent: true });
}
