import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { syncIntervalsActivities } from '@/lib/intervals-sync';

export async function GET() {
  const apiKey    = process.env.INTERVALS_API_KEY;
  const athleteId = process.env.INTERVALS_ATHLETE_ID;

  if (!apiKey || !athleteId) {
    return NextResponse.json({ error: 'Intervals.icu not configured' }, { status: 503 });
  }

  // Hit the API raw so we can see the exact shape
  const oldest = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const newest = new Date().toISOString().slice(0, 10);
  const url    = `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${oldest}&newest=${newest}`;
  const auth   = Buffer.from(`API_KEY:${apiKey}`).toString('base64');

  const raw = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!raw.ok) {
    return NextResponse.json({ error: `Intervals.icu: ${raw.status}`, text: await raw.text() }, { status: 502 });
  }

  const activities = await raw.json();

  // Also run the real sync into the workouts table
  const supabase = getSupabaseAdmin();
  await syncIntervalsActivities(supabase, true).catch(e => console.error('sync error', e));

  const sample = Array.isArray(activities) ? activities.slice(0, 5) : activities;
  const total  = Array.isArray(activities) ? activities.length : 'unknown';

  return NextResponse.json({ total, sample });
}
