import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Webhook endpoint for automated sleep logging.
// Call this from an iOS Shortcut, Garmin Connect IQ, or any automation:
//
//   POST /api/habits/sleep
//   x-api-secret: <AUTH_SECRET from .env.local>
//   Content-Type: application/json
//   { "date": "2025-06-01", "hours": 7.5, "habitId": "sleep" }
//
// The endpoint marks the sleep habit as done for the given date if
// hours >= minHours (default 7). It merges with any existing done list
// so other habits logged that day are preserved.

const DEFAULT_HABIT_ID = 'sleep';
const DEFAULT_MIN_HOURS = 7;

export async function POST(req: NextRequest) {
  // Programmatic auth via x-api-secret header (same as middleware)
  const secret = process.env.AUTH_SECRET;
  const provided = req.headers.get('x-api-secret');
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    date?: string;
    hours?: number;
    habitId?: string;
    minHours?: number;
  };

  const date     = body.date;
  const hours    = typeof body.hours === 'number' ? body.hours : null;
  const habitId  = body.habitId ?? DEFAULT_HABIT_ID;
  const minHours = body.minHours ?? DEFAULT_MIN_HOURS;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 });
  }
  if (hours === null) {
    return NextResponse.json({ error: 'hours is required (number)' }, { status: 400 });
  }

  const slept = hours >= minHours;

  // Read today's existing log so we don't wipe other habits
  const { data: existing } = await supabaseAdmin
    .from('daily_logs')
    .select('notes')
    .eq('log_date', date)
    .maybeSingle();

  const existingDone: string[] = (existing?.notes as Record<string, unknown> | null)
    ?.habits
    ? ((existing!.notes as Record<string, Record<string, unknown>>).habits.done as string[] | null) ?? []
    : [];

  const done = slept
    ? Array.from(new Set([...existingDone, habitId]))       // add sleep habit
    : existingDone.filter((id: string) => id !== habitId);  // remove if not enough sleep

  const { error } = await supabaseAdmin
    .from('daily_logs')
    .upsert(
      { log_date: date, notes: { habits: { done } } },
      { onConflict: 'log_date' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, date, hours, slept, done });
}
