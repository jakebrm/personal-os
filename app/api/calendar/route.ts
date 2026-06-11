import { NextResponse } from 'next/server';
import ICAL from 'ical.js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { HOME_TZ } from '@/lib/dates';

export type CalEvent = {
  id: string;
  title: string;
  /**
   * Timed events:  "YYYY-MM-DDTHH:mm:ss"  — Chicago local, NO timezone suffix.
   *   Browsers parse tz-less ISO datetimes as local time, so new Date(e.start)
   *   gives the correct local Date without any client-side conversion.
   * All-day events: "YYYY-MM-DD" — calendar date, no time component.
   */
  start: string;
  end: string;
  location?: string;
  allDay: boolean;
  color?: string;
  /** Name of the secondary feed this event came from; undefined = main calendar. */
  calendar?: string;
};

// ── Module-level 5-minute cache ──────────────────────────────────────────────
let cache: { events: CalEvent[]; fetchedAt: number; dateStr: string } | null = null;
const TTL_MS      = 5 * 60 * 1000;
const WINDOW_DAYS = 14;
const TZ          = HOME_TZ;

// ── Intl-based timezone conversion ───────────────────────────────────────────

/**
 * Convert a UTC Date to a Chicago local datetime string "YYYY-MM-DDTHH:mm:ss".
 * Immune to whether VTIMEZONE blocks are registered.
 */
function chicagoISO(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year:    'numeric',
    month:   '2-digit',
    day:     '2-digit',
    hour:    '2-digit',
    minute:  '2-digit',
    second:  '2-digit',
    hour12:  false,
  }).formatToParts(date);

  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  const h = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day}T${h}:${p.minute}:${p.second}`;
}

/**
 * All-day events carry a DATE value — read components directly to avoid
 * UTC-midnight shift from toJSDate().
 */
function dateOnly(t: ICAL.Time): string {
  return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
}

function cvtStart(t: ICAL.Time): string { return t.isDate ? dateOnly(t) : chicagoISO(t.toJSDate()); }
function cvtEnd(t: ICAL.Time): string   { return t.isDate ? dateOnly(t) : chicagoISO(t.toJSDate()); }

/**
 * Returns UTC ms for Chicago midnight on the current Chicago calendar day.
 * Works correctly across DST transitions.
 *
 * Strategy: take Chicago's current date string, construct noon UTC on that date
 * (guaranteed to be after Chicago midnight of that day since Chicago is UTC-5/6),
 * then subtract the Chicago time-of-day at that noon UTC point.
 */
function chicagoMidnightMs(): number {
  const now = new Date();
  // en-CA gives "YYYY-MM-DD" format
  const chicagoDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
  const [year, month, day] = chicagoDate.split('-').map(Number);
  // Noon UTC is always 6am or 7am Chicago — same calendar day, never before midnight
  const noonUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(noonUTC);
  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  const h = p.hour === '24' ? 0 : parseInt(p.hour);
  const m = parseInt(p.minute);
  const s = parseInt(p.second);
  return noonUTC.getTime() - (h * 3600 + m * 60 + s) * 1000;
}

// ── feeds ─────────────────────────────────────────────────────────────────────
type Feed = { url: string; name?: string };

/**
 * Main calendar from GOOGLE_CALENDAR_ICAL_URL (events untagged), plus secondary
 * feeds from CALENDAR_EXTRA_FEEDS — comma-separated "Name|ical-url" pairs, e.g.
 *   CALENDAR_EXTRA_FEEDS="Work|https://…/basic.ics,Family|https://…/basic.ics"
 * Secondary events carry calendar: Name so the UI can render them as not-mine.
 */
function feedList(): Feed[] {
  const feeds: Feed[] = [];
  if (process.env.GOOGLE_CALENDAR_ICAL_URL) {
    feeds.push({ url: process.env.GOOGLE_CALENDAR_ICAL_URL });
  }
  for (const entry of (process.env.CALENDAR_EXTRA_FEEDS ?? '').split(',')) {
    const sep = entry.indexOf('|');
    if (sep < 1) continue;
    const name = entry.slice(0, sep).trim();
    const url  = entry.slice(sep + 1).trim();
    if (name && url) feeds.push({ name, url });
  }
  return feeds;
}

// ── fetch + parse ─────────────────────────────────────────────────────────────
async function fetchFeed(feed: Feed): Promise<CalEvent[]> {
  const res = await fetch(feed.url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`iCal fetch failed (${feed.name ?? 'main'}): ${res.status}`);
  return parseFeed(await res.text(), feed.name);
}

function parseFeed(text: string, calName?: string): CalEvent[] {
  // Window bounds: Chicago midnight today → Chicago midnight today+14
  const wStartMs   = chicagoMidnightMs();
  const wEndMs     = wStartMs + WINDOW_DAYS * 24 * 60 * 60 * 1000;
  // Date strings for all-day event comparison (avoids UTC-midnight artefacts)
  const todayStr   = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(wStartMs));
  const endDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(wEndMs));

  // Is this start time before the window? (all-day: date string; timed: UTC ms)
  function beforeWindow(t: ICAL.Time): boolean {
    return t.isDate ? dateOnly(t) < todayStr : t.toJSDate().getTime() < wStartMs;
  }
  // Is this start time at or past the window end?
  function pastWindow(t: ICAL.Time): boolean {
    return t.isDate ? dateOnly(t) >= endDateStr : t.toJSDate().getTime() >= wEndMs;
  }

  const jcal = ICAL.parse(text);
  const comp  = new ICAL.Component(jcal);

  // Register VTIMEZONEs so ical.js can do UTC offset math inside the iterator
  for (const vtz of comp.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(vtz);
  }

  const events: CalEvent[] = [];

  for (const vevent of comp.getAllSubcomponents('vevent')) {
    // Skip cancelled events
    if (vevent.getFirstPropertyValue('status') === 'CANCELLED') continue;

    const ev = new ICAL.Event(vevent);

    // Skip exception instances — the master event's iterator folds them in
    if (ev.isRecurrenceException()) continue;

    if (ev.isRecurring()) {
      // Do NOT pass a hint to iterator() — ical.js replaces DTSTART with the hint,
      // which corrupts yearly expansions (birthday lands on hint date instead of its
      // actual month/day) and breaks EXDATE matching for daily/weekly events.
      // Oldest DTSTART in this feed is ~2022, so max ~95 iterations to reach today.
      const iter  = ev.iterator();
      let   next: ICAL.Time | null;
      let   guard = 5000;

      while (--guard > 0 && (next = iter.next())) {
        // Iterator is ordered — once past the window we're done
        if (pastWindow(next)) break;
        // Skip occurrences before the window (iterator hint may land slightly early)
        if (beforeWindow(next)) continue;

        const occ = ev.getOccurrenceDetails(next);
        events.push({
          id:       `${ev.uid}-${next.toICALString()}`,
          title:    occ.item.summary  || '(no title)',
          start:    cvtStart(occ.startDate),
          end:      cvtEnd(occ.endDate),
          location: occ.item.location || undefined,
          allDay:   occ.startDate.isDate,
          color:    occ.item.color    || undefined,
          calendar: calName,
        });
      }
    } else {
      // Filter by start date: only include events that begin within the window
      if (beforeWindow(ev.startDate) || pastWindow(ev.startDate)) continue;

      events.push({
        id:       ev.uid || crypto.randomUUID(),
        title:    ev.summary  || '(no title)',
        start:    cvtStart(ev.startDate),
        end:      cvtEnd(ev.endDate),
        location: ev.location || undefined,
        allDay:   ev.startDate.isDate,
        color:    ev.color    || undefined,
        calendar: calName,
      });
    }
  }

  return events;
}

// ── friend birthdays ──────────────────────────────────────────────────────────

/**
 * Friends' birthdays from Supabase, merged into the agenda as all-day events.
 * (Don't also add the birthdays.ics feed to CALENDAR_EXTRA_FEEDS — that would
 * show every birthday twice.) Failures degrade to an empty list so the
 * calendar still loads without the database.
 */
async function birthdayEvents(): Promise<CalEvent[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('friends')
      .select('id, name, birthday')
      .eq('user_id', 'owner')
      .not('birthday', 'is', null)
      .neq('status', 'written_off');
    if (error || !data) return [];

    const wStartMs   = chicagoMidnightMs();
    const todayStr   = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(wStartMs));
    const endDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(wStartMs + WINDOW_DAYS * 86_400_000));
    const startYear  = Number(todayStr.slice(0, 4));

    const events: CalEvent[] = [];
    for (const f of data) {
      const md = (f.birthday as string).slice(5); // "MM-DD"
      // The 14-day window can straddle New Year, so try this year and next
      for (const year of [startYear, startYear + 1]) {
        const ds = `${year}-${md}`;
        if (ds < todayStr || ds >= endDateStr) continue;
        const [yy, mm, dd] = ds.split('-').map(Number);
        const probe = new Date(Date.UTC(yy, mm - 1, dd));
        if (probe.getUTCMonth() + 1 !== mm) continue; // Feb 29 in a non-leap year
        const dayAfter = new Date(Date.UTC(yy, mm - 1, dd + 1));
        events.push({
          id:       `bday-${f.id}-${ds}`,
          title:    `🎂 ${f.name}`,
          start:    ds,
          end:      dayAfter.toISOString().slice(0, 10),
          allDay:   true,
          calendar: 'Birthdays',
        });
      }
    }
    return events;
  } catch {
    return [];
  }
}

async function fetchAndParse(): Promise<CalEvent[]> {
  const feeds = feedList();

  const [results, bdays] = await Promise.all([
    Promise.allSettled(feeds.map(fetchFeed)),
    birthdayEvents(),
  ]);

  // The main feed failing is an error (widget shows "Could not load calendar");
  // a broken secondary feed just drops out silently.
  const mainResult = feeds.length > 0 && feeds[0].name === undefined ? results[0] : null;
  if (mainResult?.status === 'rejected') throw mainResult.reason;

  const events = results
    .filter((r): r is PromiseFulfilledResult<CalEvent[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .concat(bdays);
  events.sort((a, b) => a.start.localeCompare(b.start));
  return events;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  // ?bust clears the module-level cache — useful after deploys or for debugging
  const bust    = new URL(req.url).searchParams.has('bust');
  const now     = Date.now();
  const todayDs = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  if (bust || !cache || now - cache.fetchedAt > TTL_MS || cache.dateStr !== todayDs) {
    cache = { events: await fetchAndParse(), fetchedAt: now, dateStr: todayDs };
  }
  return NextResponse.json(
    { events: cache.events },
    { headers: { 'cache-control': 'no-store' } },
  );
}
