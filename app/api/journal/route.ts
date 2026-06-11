import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

type LogRow = {
  log_date: string;
  content:  string | null;
  notes:    { habits?: { done?: string[] } } | null;
};

type JournalRow = {
  date:    string;
  content: string | null;
  mood:    number | null;
};

export async function GET(req: NextRequest) {
  const month = new URL(req.url).searchParams.get('month') ?? '';
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Expected month=YYYY-MM' }, { status: 400 });
  }

  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const start   = `${month}-01`;
  const end     = `${month}-${String(lastDay).padStart(2, '0')}`;

  const [logsRes, journalRes] = await Promise.all([
    supabaseAdmin
      .from('daily_logs')
      .select('log_date, content, notes')
      .gte('log_date', start)
      .lte('log_date', end)
      .order('log_date'),
    supabaseAdmin
      .from('journal_entries')
      .select('date, content, mood')
      .eq('user_id', 'owner')
      .gte('date', start)
      .lte('date', end),
  ]);

  if (logsRes.error) return NextResponse.json({ error: logsRes.error.message }, { status: 500 });

  // Build maps: date → imported content / mood from journal_entries
  const importedContent = new Map<string, string>();
  const moodByDate      = new Map<string, number>();
  for (const row of ((journalRes.data ?? []) as JournalRow[])) {
    if (row.content) importedContent.set(row.date, row.content);
    if (row.mood != null) moodByDate.set(row.date, row.mood);
  }

  // Merge: imported text takes precedence over live-typed content
  const datesSeen = new Set<string>();
  const entries: { date: string; content: string; habits: string[]; mood: number | null }[] = [];

  for (const row of ((logsRes.data ?? []) as LogRow[])) {
    datesSeen.add(row.log_date);
    entries.push({
      date:    row.log_date,
      content: importedContent.get(row.log_date) ?? row.content ?? '',
      habits:  row.notes?.habits?.done ?? [],
      mood:    moodByDate.get(row.log_date) ?? null,
    });
  }

  // Dates that only exist in journal_entries (no daily_log row for that day)
  for (const [date, content] of importedContent) {
    if (!datesSeen.has(date)) {
      entries.push({ date, content, habits: [], mood: moodByDate.get(date) ?? null });
    }
  }
  for (const [date, mood] of moodByDate) {
    if (!datesSeen.has(date) && !importedContent.has(date)) {
      entries.push({ date, content: '', habits: [], mood });
      datesSeen.add(date);
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ entries });
}
