import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Wake-up time logging. Stored in daily_logs.notes.wakeTime ("HH:MM", 24h),
// alongside the habits/journal keys already in that JSON blob.
//
// Manual logging happens in-app (authenticated by the session cookie via
// middleware). It can ALSO be driven automatically by an iOS Shortcut /
// Garmin automation that POSTs with the x-api-secret header — e.g. an
// "When my alarm stops" automation:
//
//   POST /api/habits/wake
//   x-api-secret: <AUTH_SECRET>
//   { "date": "2026-06-08", "wakeTime": "06:30" }

type DailyLogRow = { log_date: string; notes: { wakeTime?: string } | null };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(parseInt(searchParams.get('days') ?? '14', 10), 90));

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from('daily_logs')
    .select('log_date, notes')
    .gte('log_date', sinceStr)
    .order('log_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const logs = ((data ?? []) as DailyLogRow[])
    .map(row => ({ date: row.log_date, wakeTime: row.notes?.wakeTime ?? null }))
    .filter(l => l.wakeTime);

  return NextResponse.json({ logs });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { date?: string; wakeTime?: string | null };
  const date = body.date;
  // Empty string / null clears the entry.
  const wakeTime = body.wakeTime ? body.wakeTime.trim() : null;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 });
  }
  if (wakeTime !== null && !TIME_RE.test(wakeTime)) {
    return NextResponse.json({ error: 'wakeTime must be HH:MM (24h)' }, { status: 400 });
  }

  // Merge into the day's notes blob without clobbering habits/journal keys.
  const { data: existing } = await supabaseAdmin
    .from('daily_logs')
    .select('id, notes')
    .eq('log_date', date)
    .maybeSingle();

  const notes = { ...((existing?.notes as Record<string, unknown>) ?? {}) };
  if (wakeTime === null) delete notes.wakeTime;
  else notes.wakeTime = wakeTime;

  const { error } = await supabaseAdmin
    .from('daily_logs')
    .upsert(
      { ...(existing?.id ? { id: existing.id } : {}), log_date: date, notes },
      { onConflict: 'log_date' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, date, wakeTime });
}
