import { supabaseAdmin } from '@/lib/supabase/admin';
import { fetchWeather } from '@/lib/weather';
import { GET as calendarGET } from '@/app/api/calendar/route';
import type { CalEvent } from '@/app/api/calendar/route';
import { HOME_TZ } from '@/lib/dates';

// Morning brief composer — pure data, zero LLM/API-credit usage.
// News comes from the free Hacker News Algolia API; everything else is
// open-meteo (already free) + the owner's own database.

const TZ = HOME_TZ;

export const chicagoToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

function chicagoNowMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  return (parseInt(p.hour === '24' ? '0' : p.hour, 10) * 60) + parseInt(p.minute, 10);
}

function fmtMins(mins: number): string {
  const h24 = Math.floor(mins / 60), m = mins % 60;
  const ap = h24 < 12 ? 'a' : 'p';
  let h = h24 % 12; if (h === 0) h = 12;
  return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, '0')}${ap}`;
}

function eventMins(iso: string): number {
  // Timed events are tz-less Chicago-local "YYYY-MM-DDTHH:mm:ss"
  return parseInt(iso.slice(11, 13), 10) * 60 + parseInt(iso.slice(14, 16), 10);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Section builders ──────────────────────────────────────────────────────────

async function weatherLine(): Promise<string> {
  try {
    const wx = await fetchWeather();
    const rain = wx.dailySummary.precipProb >= 25 ? ` · ☂ ${wx.dailySummary.precipProb}% rain` : '';
    return `◑ ${wx.temp}° ${wx.desc.toLowerCase()} · ${wx.hi}/${wx.lo}${rain} · ☀ ${wx.dailySummary.sunrise}`;
  } catch { return ''; }
}

async function todayEvents(): Promise<CalEvent[]> {
  try {
    const res  = await calendarGET(new Request('http://internal/api/calendar'));
    const data = await res.json() as { events?: CalEvent[] };
    const today = chicagoToday();
    return (data.events ?? [])
      .filter(e => e.start.startsWith(today))
      .sort((a, b) => a.start.localeCompare(b.start));
  } catch { return []; }
}

function agendaSection(events: CalEvent[]): string {
  if (events.length === 0) return '▦ <b>Today</b> — clear calendar';
  const lines = events.slice(0, 8).map(e =>
    e.allDay
      ? `   ◦ ${esc(e.title)} <i>(all day)</i>`
      : `   ${fmtMins(eventMins(e.start))} — ${esc(e.title)}`);
  return `▦ <b>Today</b> · ${events.length} event${events.length !== 1 ? 's' : ''}\n${lines.join('\n')}`;
}

type TrainingRow = {
  name: string; sport: string; duration_minutes: number | null;
  primary_zone: string | null; human_readable: string | null; completed: boolean;
};

async function trainingSection(events: CalEvent[]): Promise<string> {
  const today = chicagoToday();
  // Reconcile first so yesterday-evening sessions show as ✓ this morning
  const { syncIntervalsActivities } = await import('@/lib/intervals-sync');
  const { autoCompleteTraining }    = await import('@/lib/training-reconcile');
  await syncIntervalsActivities(supabaseAdmin).catch(() => {});
  await autoCompleteTraining(supabaseAdmin).catch(() => {});

  const { data } = await supabaseAdmin
    .from('training_workouts')
    .select('name, sport, duration_minutes, primary_zone, human_readable, completed')
    .eq('date', today);
  const rows = (data ?? []) as TrainingRow[];
  if (rows.length === 0) return '↑ <b>Training</b> — rest day';

  const lines = rows.map(w => {
    const bits = [w.sport, w.duration_minutes ? `${w.duration_minutes}m` : null, w.primary_zone]
      .filter(Boolean).join(' · ');
    return `   ${w.completed ? '✓ ' : ''}${esc(w.name)}${bits ? ` <i>(${esc(bits)})</i>` : ''}`;
  });

  // Suggest the first calendar gap big enough for the longest pending workout
  const pending = rows.filter(w => !w.completed);
  const need = Math.max(45, ...pending.map(w => w.duration_minutes ?? 0)) + 15; // +15m buffer
  let slot = '';
  if (pending.length > 0) {
    const busy = events
      .filter(e => !e.allDay)
      .map(e => [eventMins(e.start), eventMins(e.end)] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    let cursor = Math.max(6 * 60, chicagoNowMinutes());  // not before 6a / right now
    let found: [number, number] | null = null;
    for (const [s, e] of busy) {
      if (s - cursor >= need) { found = [cursor, s]; break; }
      cursor = Math.max(cursor, e);
    }
    if (!found && 21 * 60 - cursor >= need) found = [cursor, 21 * 60];
    if (found) slot = `\n   ◷ best slot: <b>${fmtMins(found[0])}–${fmtMins(found[1])}</b>`;
  }

  return `↑ <b>Training</b>\n${lines.join('\n')}${slot}`;
}

async function pulseLine(): Promise<string> {
  const today = chicagoToday();
  const monthStart = today.slice(0, 8) + '01';
  const [tasksRes, friendsRes, liftsRes] = await Promise.all([
    // urgency lives inside the metadata JSON blob (see lib/tasks rowToTask)
    supabaseAdmin.from('tasks').select('id, metadata').eq('status', 'pending'),
    supabaseAdmin.from('friends').select('contact_frequency_days, last_contacted_at').eq('user_id', 'owner'),
    supabaseAdmin.from('workouts').select('date').eq('user_id', 'owner')
      .ilike('type', '%WeightTraining%').gte('date', monthStart).lte('date', today),
  ]);

  const tasks = (tasksRes.data ?? []) as { metadata: { urgency?: string } | null }[];
  const dueToday = tasks.filter(t => t.metadata?.urgency === 'today').length;
  const taskBit = dueToday > 0
    ? `☑ <b>${dueToday}</b> due today`
    : `☑ ${tasks.length} task${tasks.length !== 1 ? 's' : ''} open`;

  const overdue = ((friendsRes.data ?? []) as { contact_frequency_days: number; last_contacted_at: string | null }[])
    .filter(f => f.last_contacted_at &&
      (Date.now() - new Date(f.last_contacted_at + 'T12:00:00').getTime()) / 86_400_000 > f.contact_frequency_days)
    .length;
  const friendBit = overdue > 0 ? `❀ ${overdue} friend${overdue !== 1 ? 's' : ''} due` : null;

  const liftDays = new Set(((liftsRes.data ?? []) as { date: string }[]).map(r => r.date)).size;
  const liftBit  = `🏋 ${liftDays} lift day${liftDays !== 1 ? 's' : ''} this month`;

  return [taskBit, friendBit, liftBit].filter(Boolean).join(' · ');
}

const AI_RE = /\b(ai|llm|gpt|claude|openai|anthropic|gemini|deepmind|mistral|llama|model|agent|transformer|neural)\b/i;
type HnHit = { title: string; url: string | null; objectID: string; points: number };

async function aiNewsSection(): Promise<string> {
  try {
    // Free, keyless. Front page first; top-ranked AI stories of the day as backfill.
    const [front, top] = await Promise.all([
      fetch('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50', { signal: AbortSignal.timeout(6000) }).then(r => r.json()),
      fetch(`https://hn.algolia.com/api/v1/search?query=AI&tags=story&numericFilters=created_at_i>${Math.floor(Date.now() / 1000) - 86_400}&hitsPerPage=20`, { signal: AbortSignal.timeout(6000) }).then(r => r.json()),
    ]);
    const seen = new Set<string>();
    const picks: HnHit[] = [];
    for (const hit of [...(front.hits ?? []), ...(top.hits ?? [])] as HnHit[]) {
      if (picks.length >= 4) break;
      if (!hit.title || seen.has(hit.objectID) || !AI_RE.test(hit.title)) continue;
      seen.add(hit.objectID);
      picks.push(hit);
    }
    if (picks.length === 0) return '';
    const lines = picks.map(h => {
      const url = h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`;
      return `   • <a href="${url}">${esc(h.title)}</a>`;
    });
    return `◈ <b>AI today</b>\n${lines.join('\n')}`;
  } catch { return ''; }
}

// ── Composer ──────────────────────────────────────────────────────────────────

export async function composeBrief(): Promise<string> {
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric',
  }).format(now).toUpperCase();

  const events = await todayEvents();
  const [wx, training, pulse, news] = await Promise.all([
    weatherLine(),
    trainingSection(events),
    pulseLine(),
    aiNewsSection(),
  ]);

  return [
    `✦ <b>Morning, the owner</b> — ${dateLabel}`,
    wx,
    '',
    agendaSection(events),
    '',
    training,
    '',
    pulse,
    news ? `\n${news}` : '',
  ].filter(s => s !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
