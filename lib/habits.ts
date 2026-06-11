// ── Types ─────────────────────────────────────────────────────────────────────

export type HabitDef = {
  id: string;
  label: string;
};

// ── Default habit list ────────────────────────────────────────────────────────

export const DEFAULT_HABITS: HabitDef[] = [
  { id: 'workout',    label: 'Workout'    },
  { id: 'run',        label: 'Run'        },
  { id: 'vitamins',   label: 'Vitamins'   },
  { id: 'water',      label: 'Water'      },
  { id: 'sleep',      label: 'Sleep'      },
  { id: 'read',       label: 'Read'       },
  { id: 'meditation', label: 'Meditation' },
];

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Uses the user's local clock — NEVER toISOString() which is UTC and rolls
 * over at midnight UTC, not midnight local time.
 */
export function localDateKey(): string {
  return dateToKey(new Date());
}

export function dateToKey(d: Date): string {
  return (
    String(d.getFullYear()) + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/** ISO keys for the last n days (oldest first). */
export function lastNDays(n: number): string[] {
  const keys: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    keys.push(dateToKey(new Date(base.getTime() - i * 86_400_000)));
  }
  return keys;
}

/** All calendar-day keys for a given year/month (0-indexed month). */
export function daysInMonth(year: number, month: number): string[] {
  const days: string[] = [];
  const last = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    days.push(dateToKey(new Date(year, month, d)));
  }
  return days;
}

/**
 * Consecutive-day streak for one habit ending on today.
 * allowTodayGrace: if today isn't done yet, start counting from yesterday
 * so an active streak isn't zeroed out before the day is logged.
 */
export function calcStreak(
  id: string,
  today: string,
  todayDone: string[],
  history: Map<string, string[]>,
  allowTodayGrace = false,
): number {
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (allowTodayGrace && !todayDone.includes(id)) {
    d.setDate(d.getDate() - 1);
  }
  for (let i = 0; i < 366; i++) {
    const key  = dateToKey(d);
    const done = key === today ? todayDone : (history.get(key) ?? []);
    if (!done.includes(id)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** 30-day completion rate for one habit (0–100). */
export function completionRate(
  id: string,
  today: string,
  todayDone: string[],
  history: Map<string, string[]>,
): number {
  const days = lastNDays(30);
  const count = days.filter(k => {
    const done = k === today ? todayDone : (history.get(k) ?? []);
    return done.includes(id);
  }).length;
  return Math.round((count / 30) * 100);
}

// ── localStorage — daily log ──────────────────────────────────────────────────
const LS_LOG_PREFIX = 'habit-done-';

export function lsRead(date: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_LOG_PREFIX + date);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export function lsWrite(date: string, done: string[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_LOG_PREFIX + date, JSON.stringify(done)); } catch {}
}

// ── localStorage — habit config ───────────────────────────────────────────────
const LS_CONFIG_KEY = 'habit-config';

export function lsReadConfig(): HabitDef[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY);
    return raw ? (JSON.parse(raw) as HabitDef[]) : null;
  } catch { return null; }
}

export function lsWriteConfig(habits: HabitDef[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(habits)); } catch {}
}
