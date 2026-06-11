'use client';
import { useEffect, useRef, useState } from 'react';
import { Panel } from '../Panel';
import type { CalEvent } from '@/app/api/calendar/route';

// ── helpers ───────────────────────────────────────────────────────────────────
const DAY_MS   = 86_400_000;
const WDAYS    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(d: Date): string {
  // Local date key "YYYY-MM-DD" — avoids UTC-shift artefacts
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmt12(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtDuration(startISO: string, endISO: string): string {
  const mins = Math.round((Date.parse(endISO) - Date.parse(startISO)) / 60_000);
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** Events that start on, or span across, a local calendar day `key` */
function eventsOnDay(events: CalEvent[], key: string): CalEvent[] {
  return events.filter(e => {
    const sd = e.start.slice(0, 10);
    const ed = e.end.slice(0, 10);
    if (e.allDay) {
      // DTEND is exclusive per iCal spec
      return sd <= key && ed > key;
    }
    // Timed: show if it starts on this day, or started before and ends after (strictly)
    return sd === key || (sd < key && ed > key);
  });
}

// ── sub-component ─────────────────────────────────────────────────────────────
function EventRow({ event, past }: { event: CalEvent; past: boolean }) {
  const start    = new Date(event.start);
  const timeStr  = event.allDay ? 'all day' : fmt12(start);
  const duration = event.allDay ? '' : fmtDuration(event.start, event.end);
  const sub      = [event.location, duration].filter(Boolean).join(' · ');

  return (
    <div className={`tev${past ? ' ghost' : ''}${event.calendar ? ' sec' : ''}`}>
      <div className="tm">{timeStr}</div>
      <div className="tbar" />
      <div className="tc">
        <div className="tt">
          {event.title}
          {event.calendar && <span className="cal-src">{event.calendar}</span>}
        </div>
        {sub && <div className="td">{sub}</div>}
      </div>
    </div>
  );
}

// ── main card ─────────────────────────────────────────────────────────────────
export function CalendarCard({ delay }: { delay?: number }) {
  const [events,   setEvents]  = useState<CalEvent[]>([]);
  const [loading,  setLoading] = useState(true);
  const [fetchErr, setErr]     = useState(false);

  // Re-derive today on every render so day-boundary rolls over correctly
  const today    = todayMidnight();
  const todayKey = isoDate(today);

  const [selectedKey, setSelectedKey] = useState(todayKey);
  const nowRef      = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // ── fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/calendar')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(({ events: evts }: { events: CalEvent[] }) => setEvents(evts))
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, []);

  // ── 7-day strip ───────────────────────────────────────────────────────────
  const strip = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getTime() + i * DAY_MS);
    return {
      key:     isoDate(d),
      wday:    WDAYS[d.getDay()],
      num:     d.getDate(),
      isToday: i === 0,
    };
  });

  // ── derived data ──────────────────────────────────────────────────────────
  const dayEvents   = eventsOnDay(events, selectedKey);
  const todayEvents = eventsOnDay(events, todayKey);
  const nowMs       = Date.now();
  const isToday     = selectedKey === todayKey;

  const pastEvents   = isToday ? dayEvents.filter(e => Date.parse(e.end) < nowMs)  : [];
  const activeEvents = isToday ? dayEvents.filter(e => Date.parse(e.end) >= nowMs) : dayEvents;

  // Label for the selected day header
  const selDate  = new Date(selectedKey + 'T12:00:00');
  const dayLabel = `${WDAYS[selDate.getDay()]}, ${MONTHS[selDate.getMonth()]} ${selDate.getDate()}`;

  return (
    <Panel
      glyph="◷"
      title="Calendar"
      meta={<span className="pill">{loading ? '…' : `${todayEvents.length} today`}</span>}
      delay={delay}
    >
      {/* ── 7-day strip ── */}
      <div className="cal-strip">
        {strip.map(d => {
          const dayEvts  = eventsOnDay(events, d.key);
          const hasMain  = dayEvts.some(e => !e.calendar);
          const hasSec   = dayEvts.some(e => e.calendar);
          const isOn     = d.key === selectedKey;
          return (
            <button
              key={d.key}
              className={`cal-day${isOn ? ' on' : ''}${d.isToday ? ' today' : ''}`}
              onClick={() => {
                setSelectedKey(d.key);
                if (d.isToday) setTimeout(() => nowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
              }}
              aria-pressed={isOn}
            >
              <span className="cal-wday">{d.wday}</span>
              <span className="cal-num">{d.num}</span>
              {(hasMain || hasSec) && (
                <span className="cal-dots">
                  {hasMain && <span className="cal-dot" />}
                  {hasSec && <span className="cal-dot sec" />}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── day label ── */}
      <div className="cal-day-label">{dayLabel}</div>

      {/* ── timeline ── */}
      <div className="cal-timeline" ref={timelineRef}>
        {loading && (
          <>
            <div className="cal-skel" />
            <div className="cal-skel" style={{ opacity: .6 }} />
          </>
        )}

        {!loading && fetchErr && (
          <div className="cal-empty">Could not load calendar</div>
        )}

        {!loading && !fetchErr && dayEvents.length === 0 && (
          <div className="cal-empty">No events</div>
        )}

        {!loading && !fetchErr && dayEvents.length > 0 && (
          <>
            {pastEvents.map(e => <EventRow key={e.id} event={e} past />)}

            {/* NOW marker — only shown for today */}
            {isToday && (
              <div className="cal-now" ref={nowRef}>
                <span className="cal-now-label">{fmt12(new Date())}</span>
                <div className="cal-now-line" />
              </div>
            )}

            {activeEvents.map(e => <EventRow key={e.id} event={e} past={false} />)}
          </>
        )}
      </div>
    </Panel>
  );
}
