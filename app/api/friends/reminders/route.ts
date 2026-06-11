import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { computeFields } from '../route';
import { sendTelegramMessage } from '@/lib/telegram';

export async function GET(req: Request) {
  // Vercel cron sends Authorization: Bearer $CRON_SECRET — validate it.
  // Fail closed: without CRON_SECRET configured, nobody can trigger this.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('friends')
    .select('*')
    .eq('user_id', 'owner');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const friends = (data ?? []).map(f => computeFields(f as Record<string, unknown>));
  const overdue = friends.filter(f => f.overdue).sort((a, b) => b.days_overdue - a.days_overdue);

  if (overdue.length === 0) {
    return NextResponse.json({ sent: false, reason: 'no overdue friends' });
  }

  const lines = overdue.slice(0, 10).map(f => {
    const label = f.days_overdue === 1 ? '1 day overdue' : `${f.days_overdue} days overdue`;
    return `• <b>${f.name}</b> — ${label}`;
  });

  const more = overdue.length > 10 ? `\n…and ${overdue.length - 10} more.` : '';
  const message = `👋 <b>Keep in Touch — ${overdue.length} overdue</b>\n\n${lines.join('\n')}${more}`;

  await sendTelegramMessage(message);

  return NextResponse.json({ sent: true, count: overdue.length });
}
