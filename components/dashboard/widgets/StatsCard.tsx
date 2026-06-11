'use client';
import { useEffect, useState } from 'react';
import { Panel } from '../Panel';
import { Sparkline } from '../helpers';
import type { WellnessRow, StravaRow } from '../../health/useHealthData';
import { sportTab } from '../../health/useHealthData';
import type { CalEvent } from '@/app/api/calendar/route';
import { homeDateStr } from '@/lib/dates';

// ── Week boundaries ───────────────────────────────────────────────────────────

function mondayOf(offset = 0): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  return d.toISOString().slice(0, 10);
}

// ── Stat helpers ──────────────────────────────────────────────────────────────

function safeAvg(vals: (number | null | undefined)[]): number {
  const v = vals.filter((n): n is number => n != null && n > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

type Delta = { arrow: string; color: string; pct: number };

function weekDelta(curr: number, prev: number, lowerBetter = false): Delta | null {
  if (!prev || !curr) return null;
  const pct  = Math.round(Math.abs((curr - prev) / prev) * 100);
  if (pct < 3) return null;
  const up   = curr > prev;
  const good = lowerBetter ? !up : up;
  return { arrow: up ? '↑' : '↓', pct, color: good ? '#52a874' : '#d45252' };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Cell({
  value, label, delta, accent,
}: {
  value: string; label: string; delta?: Delta | null; accent?: string;
}) {
  return (
    <div style={{
      background: 'var(--ph)', borderRadius: 11,
      padding: '10px 12px', border: '1px solid var(--ph-bd)',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700,
        lineHeight: 1, color: accent ?? 'var(--n1)',
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 10.5, color: 'var(--faint)',
        textTransform: 'uppercase', letterSpacing: '.04em',
      }}>
        {label}
      </div>
      {delta && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: delta.color, marginTop: 1 }}>
          {delta.arrow} {delta.pct}% vs last wk
        </div>
      )}
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export function StatsCard({ delay }: { delay?: number }) {
  const [wellness,    setWellness]    = useState<WellnessRow[]>([]);
  const [activities,  setActivities]  = useState<StravaRow[]>([]);
  const [events,      setEvents]      = useState<CalEvent[]>([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/health/garmin').then(r => r.json()).catch(() => []),
      fetch('/api/health/strava').then(r => r.json()).catch(() => []),
      fetch('/api/calendar').then(r => r.json()).then(d => d.events ?? []).catch(() => []),
    ]).then(([w, a, e]) => {
      setWellness(Array.isArray(w) ? w : []);
      setActivities(Array.isArray(a) ? a : []);
      setEvents(Array.isArray(e) ? e : []);
      setLoading(false);
    });
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────────

  const thisWeek = mondayOf(0);
  const lastWeek = mondayOf(-1);
  const nextWeek = mondayOf(1);

  // Wellness: this week vs last week
  const thisW = wellness.filter(r => r.date >= thisWeek && r.date < nextWeek);
  const lastW = wellness.filter(r => r.date >= lastWeek && r.date < thisWeek);

  const sleepThis  = safeAvg(thisW.map(r => r.sleep_score));
  const sleepLast  = safeAvg(lastW.map(r => r.sleep_score));
  const stepsThis  = safeAvg(thisW.map(r => r.steps));
  const stepsLast  = safeAvg(lastW.map(r => r.steps));

  // Strava: workouts this week
  const actsThis = activities.filter(a => a.date >= thisWeek && a.date < nextWeek);
  const actsLast = activities.filter(a => a.date >= lastWeek && a.date < thisWeek);

  const workoutsThis  = actsThis.length;
  const workoutsLast  = actsLast.length;

  const M_PER_MI = 1609.344;
  // Total run/bike miles this week
  const distThis = actsThis
    .filter(a => ['run','bike','swim'].includes(sportTab(a.sport_type)))
    .reduce((s, a) => s + a.distance_m, 0) / M_PER_MI;
  const distLast = actsLast
    .filter(a => ['run','bike','swim'].includes(sportTab(a.sport_type)))
    .reduce((s, a) => s + a.distance_m, 0) / M_PER_MI;

  // Calendar: events this week (timed, not all-day)
  const eventsThis = events.filter(e => !e.allDay && !e.calendar && e.start.slice(0, 10) >= thisWeek && e.start.slice(0, 10) < nextWeek).length;
  const today      = homeDateStr();
  const eventsLeft = events.filter(e => !e.allDay && !e.calendar && e.start.slice(0, 10) >= today && e.start.slice(0, 10) < nextWeek).length;

  // 7-day daily step sparkline
  const stepSpark = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(thisWeek); d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    return wellness.find(r => r.date === key)?.steps ?? 0;
  });

  const hasAny = !loading && (thisW.length > 0 || actsThis.length > 0 || events.length > 0);

  // ── Stats ───────────────────────────────────────────────────────────────────

  const wkStr = distThis > 0
    ? `${workoutsThis} · ${distThis.toFixed(1)}mi`
    : String(workoutsThis);

  const sleepStr  = sleepThis  > 0 ? sleepThis.toFixed(0)                 : '—';
  const stepsStr  = stepsThis  > 0 ? `${(stepsThis / 1000).toFixed(1)}k`  : '—';
  const eventsStr = eventsThis > 0 ? String(eventsThis) : '—';

  const sleepDelta  = weekDelta(sleepThis,    sleepLast);
  const stepsDelta  = weekDelta(stepsThis,    stepsLast);
  const wkDelta     = weekDelta(workoutsThis, workoutsLast);
  const distDelta   = distThis > 0 ? weekDelta(distThis, distLast) : null;

  const cells = [
    { value: wkStr,     label: 'workouts',    delta: wkDelta    },
    { value: sleepStr,  label: 'avg sleep',   delta: sleepDelta },
    { value: stepsStr,  label: 'avg steps',   delta: stepsDelta },
    {
      value: eventsStr,
      label: eventsLeft > 0 ? `events · ${eventsLeft} left` : 'events',
      delta: null,
    },
  ];

  const meta = !loading && workoutsThis > 0
    ? <span className="pill">{workoutsThis} workouts</span>
    : undefined;

  return (
    <Panel glyph="◈" title="This week" meta={meta} delay={delay}>
      {loading ? (
        <div style={{ color: 'var(--faint)', fontSize: 12 }}>Loading…</div>
      ) : !hasAny ? (
        <div style={{ color: 'var(--faint)', fontSize: 12 }}>No data yet this week</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {cells.map(c => (
              <Cell key={c.label} value={c.value} label={c.label} delta={c.delta} />
            ))}
          </div>

          {/* 7-day step sparkline */}
          {stepSpark.some(v => v > 0) && (
            <div>
              <div style={{
                fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase',
                letterSpacing: '.04em', marginBottom: 4,
              }}>
                steps · mon → today
              </div>
              <Sparkline data={stepSpark} h={28} />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
