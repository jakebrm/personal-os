import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { homeDateStr } from '@/lib/dates';

const wordCount = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  return t ? t.split(/\s+/).length : 0;
};

/**
 * Writing analytics for the Daily Log tab.
 * days: last 120 days of { date, words, mood } (journal_entries merged with
 * legacy daily_logs content, same precedence as GET /api/journal).
 * year/total: distinct entry-day counts across both stores (dates only — no
 * text shipped to the client).
 */
export async function GET() {
  const today = homeDateStr();
  const start = new Date(today + 'T12:00:00');
  start.setDate(start.getDate() - 119);
  const since     = start.toISOString().slice(0, 10);
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const [windowJournal, windowLogs, allJournalDates, allLogDates] = await Promise.all([
    supabaseAdmin.from('journal_entries')
      .select('date, content, mood')
      .eq('user_id', 'owner')
      .gte('date', since),
    supabaseAdmin.from('daily_logs')
      .select('log_date, content')
      .gte('log_date', since),
    supabaseAdmin.from('journal_entries')
      .select('date')
      .eq('user_id', 'owner')
      .not('content', 'is', null)
      .neq('content', ''),
    supabaseAdmin.from('daily_logs')
      .select('log_date')
      .not('content', 'is', null)
      .neq('content', ''),
  ]);

  if (windowJournal.error) {
    return NextResponse.json({ error: windowJournal.error.message }, { status: 500 });
  }

  const byDate = new Map<string, { words: number; mood: number | null }>();
  for (const row of windowLogs.data ?? []) {
    const words = wordCount(row.content as string | null);
    if (words > 0) byDate.set(row.log_date as string, { words, mood: null });
  }
  // journal_entries takes precedence (same rule as the month GET)
  for (const row of windowJournal.data ?? []) {
    const words = wordCount(row.content as string | null);
    const prev  = byDate.get(row.date as string);
    if (words === 0 && (row.mood as number | null) == null) continue;
    byDate.set(row.date as string, {
      words: words > 0 ? words : (prev?.words ?? 0),
      mood:  (row.mood as number | null) ?? prev?.mood ?? null,
    });
  }

  const days = [...byDate.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Distinct entry days across both stores
  const allDates = new Set<string>([
    ...(allJournalDates.data ?? []).map(r => r.date as string),
    ...(allLogDates.data ?? []).map(r => r.log_date as string),
  ]);
  let yearEntries = 0;
  for (const d of allDates) if (d >= yearStart) yearEntries++;

  return NextResponse.json({
    days,
    year:  { entries: yearEntries },
    total: { entries: allDates.size },
  });
}
