// Shared types + helpers for the Learning Hours time tracker (lives inside the
// Work Log deep). Each entry is one learning session: a start time, a duration
// in minutes, and an optional note about what was worked on.

import { HOME_TZ } from './dates';

export interface LearningEntry {
  id: string;
  user_id: string;
  started_at: string;        // ISO timestamp — when the session started
  duration_minutes: number;  // session length in minutes
  note: string | null;
  created_at: string;
  updated_at: string;
}

// ── Duration helpers ──────────────────────────────────────────────────────────

/** "1h 30m" / "45m" / "2h" from a minute count. */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h)      return `${h}h`;
  return `${m}m`;
}

/** Decimal hours for totals, e.g. 90 → "1.5". Trims trailing ".0". */
export function hoursLabel(min: number): string {
  const h = min / 60;
  return (Math.round(h * 10) / 10).toString();
}

// ── Chicago-time date helpers (totals are bucketed in the user's tz) ──────────

/** YYYY-MM-DD for an instant, in the home timezone. */
export function chicagoDayKey(d: Date | string = new Date()): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-CA', { timeZone: HOME_TZ }).format(date);
}

/** "Mon, Jun 8" style day label for a session's started_at, in Chicago. */
export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: HOME_TZ,
  });
}

/** "2:30 PM" clock time for a session's started_at, in Chicago. */
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: HOME_TZ,
  });
}

/** A `YYYY-MM-DDTHH:mm` string for a `<input type="datetime-local">` default (browser-local). */
export function toDatetimeLocal(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
