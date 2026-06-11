import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

type DailyLogRow = {
  log_date: string;
  notes: { habits?: { done?: string[] } } | null;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(parseInt(searchParams.get('days') ?? '30', 10), 90));

  // Compute the start date server-side (only used as a rough lower bound;
  // the client uses localDateKey() for its own "today").
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from('daily_logs')
    .select('log_date, notes')
    .gte('log_date', sinceStr)
    .order('log_date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const logs = ((data ?? []) as DailyLogRow[]).map(row => ({
    date: row.log_date,
    done: row.notes?.habits?.done ?? [],
  }));

  return NextResponse.json({ logs });
}
