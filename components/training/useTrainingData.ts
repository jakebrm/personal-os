'use client';
import { useCallback, useEffect, useState } from 'react';
import { useDemo } from '../dashboard/DemoContext';
import { buildDemoTrainingPlan } from '@/lib/demoData';

// ── Types ───────────────────────────────────────────────────────────────────

export type TrainingPlan = {
  id:         string;
  name:       string;
  event_name: string | null;
  event_date: string | null;
  plan_start: string | null;
  plan_end:   string | null;
  goal:       string | null;
  is_active:  boolean;
};

export type TrainingWorkout = {
  id:                 string;
  plan_id:            string;
  date:               string;        // YYYY-MM-DD
  day_of_week:        string | null;
  week_number:        number | null;
  phase:              string | null;
  sport:              string;        // run | strength | rest | race
  type:               string | null;
  name:               string;
  description:        string | null;
  human_readable:     string | null;
  duration_minutes:   number | null;
  distance_meters:    number | null;
  primary_zone:       string | null;
  completed:          boolean;
  completed_at:       string | null;
  notes:              string | null;
  strava_activity_id: string | null;
};

export type TrainingData = { plan: TrainingPlan | null; workouts: TrainingWorkout[] };

// ── Sport colour coding (consistent everywhere) ─────────────────────────────

export const SPORT_COLORS: Record<string, string> = {
  run:      'var(--sport-run)',   // follows the chosen background's primary hue
  strength: 'var(--sport-lift)',  // gold
  rest:     'var(--sport-other)',
  race:     'var(--danger)',
};

export function sportColor(sport: string): string {
  return SPORT_COLORS[sport?.toLowerCase()] ?? SPORT_COLORS.rest;
}

export function sportGlyph(sport: string): string {
  switch (sport?.toLowerCase()) {
    case 'run':      return '↗';
    case 'strength': return '◰';
    case 'race':     return '★';
    default:         return '○';   // rest
  }
}

export function sportLabel(sport: string): string {
  const s = sport?.toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

// ── Formatting ──────────────────────────────────────────────────────────────

const METERS_PER_MILE = 1609.34;

export function metersToMiles(m: number | null): number {
  if (!m) return 0;
  return Math.round((m / METERS_PER_MILE) * 10) / 10;
}

/** "7.5 mi" — empty string when there's no distance. */
export function fmtDistance(m: number | null): string {
  if (!m) return '';
  return `${metersToMiles(m)} mi`;
}

/** Minutes for sessions under 2hrs, otherwise "Xhr Ymin". */
export function fmtDuration(min: number | null): string {
  if (!min) return '';
  if (min < 120) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}hr ${m}min` : `${h}hr`;
}

/** Parse a YYYY-MM-DD string as a *local* date (no timezone drift). */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Add `n` days to a YYYY-MM-DD string, staying in local time. */
export function isoAddDaysLocal(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon Jun 8" */
export function fmtDayDate(s: string): string {
  const d = parseDate(s);
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Jun 8 - Jun 14" */
export function fmtWeekRange(start: string, end: string): string {
  const a = parseDate(start), b = parseDate(end);
  return `${MONTHS[a.getMonth()]} ${a.getDate()} - ${MONTHS[b.getMonth()]} ${b.getDate()}`;
}

/** Whole days from today until `s` (negative = past). */
export function daysUntil(s: string): number {
  const today = parseDate(todayISO());
  const target = parseDate(s);
  return Math.round((target.getTime() - today.getTime()) / 86400_000);
}

// ── Week helpers ────────────────────────────────────────────────────────────

export type WeekMeta = {
  weekNumber: number;
  phase:      string;
  start:      string;
  end:        string;
  workouts:   TrainingWorkout[];
};

/** Group workouts into ordered weeks with derived start/end/phase. */
export function buildWeeks(workouts: TrainingWorkout[]): WeekMeta[] {
  const byWeek = new Map<number, TrainingWorkout[]>();
  for (const w of workouts) {
    const n = w.week_number ?? 0;
    if (!byWeek.has(n)) byWeek.set(n, []);
    byWeek.get(n)!.push(w);
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekNumber, ws]) => {
      const dates = ws.map(w => w.date).sort();
      return {
        weekNumber,
        phase:    ws[0]?.phase ?? '',
        start:    dates[0],
        end:      dates[dates.length - 1],
        workouts: [...ws].sort((a, b) => a.date.localeCompare(b.date)),
      };
    });
}

export type WeekStats = { miles: number; hours: number; sessions: number; done: number };

/** Rest days are excluded from session/done counts (matches the plan UI). */
export function weekStats(workouts: TrainingWorkout[]): WeekStats {
  const sessions = workouts.filter(w => w.sport?.toLowerCase() !== 'rest');
  const miles = sessions.reduce((sum, w) => sum + metersToMiles(w.distance_meters), 0);
  const mins  = sessions.reduce((sum, w) => sum + (w.duration_minutes ?? 0), 0);
  return {
    miles:    Math.round(miles * 10) / 10,
    hours:    Math.round((mins / 60) * 10) / 10,
    sessions: sessions.length,
    done:     sessions.filter(w => w.completed).length,
  };
}

/** Pick the week containing today; clamp to first/last week of the plan. */
export function currentWeekNumber(weeks: WeekMeta[]): number {
  if (!weeks.length) return 1;
  const today = todayISO();
  const hit = weeks.find(w => today >= w.start && today <= w.end);
  if (hit) return hit.weekNumber;
  if (today < weeks[0].start) return weeks[0].weekNumber;
  return weeks[weeks.length - 1].weekNumber;
}

// ── Data hook ───────────────────────────────────────────────────────────────

export function useTraining() {
  const { isDemo } = useDemo();
  const [data, setData]       = useState<TrainingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isDemo) {
      setData(buildDemoTrainingPlan());
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/training');
      const json = await res.json() as TrainingData & { error?: string };
      if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); setData(null); }
      else         { setData({ plan: json.plan, workouts: json.workouts ?? [] }); }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, isDemo, refetch: load };
}
