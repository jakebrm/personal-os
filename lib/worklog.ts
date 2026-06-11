// Shared types, labels and week helpers for the Work Log card.
import { HOME_TZ } from './dates';

export const WORKLOG_CATEGORIES = [
  'delivery', 'leadership', 'process_improvement',
  'relationship_building', 'learning', 'other',
] as const;

export type WorkLogCategory   = (typeof WORKLOG_CATEGORIES)[number];
export type WorkLogVisibility = 'internal' | 'client_facing' | 'both';

export interface WorkLogEntry {
  id: string;
  user_id: string;
  week_start: string;            // YYYY-MM-DD, Monday of the week
  client_project: string;
  description: string;
  category: WorkLogCategory;
  impact: string | null;
  visibility: WorkLogVisibility;
  created_at: string;
  updated_at: string;
}

export const CATEGORY_LABELS: Record<WorkLogCategory, string> = {
  delivery:              'Delivery',
  leadership:            'Leadership',
  process_improvement:   'Process',
  relationship_building: 'Relationships',
  learning:              'Learning',
  other:                 'Other',
};

export const VISIBILITY_LABELS: Record<WorkLogVisibility, string> = {
  internal:      'internal',
  client_facing: 'client',
  both:          'internal + client',
};

// ── Week helpers (UTC-safe; the API decides "this week" in Chicago time) ──────

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Monday (YYYY-MM-DD) of the week containing `now`, in the home timezone. */
export function chicagoWeekStart(now = new Date()): string {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: HOME_TZ }).format(now);
  const wd  = new Intl.DateTimeFormat('en-US', { timeZone: HOME_TZ, weekday: 'short' }).format(now);
  const offset = (DOW[wd] + 6) % 7;
  return shiftWeeks(ymd, 0, -offset);
}

/** Shift a YYYY-MM-DD by N weeks (and optional extra days), UTC-safe. */
export function shiftWeeks(ymd: string, weeks: number, days = 0): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + weeks * 7 + days);
  return dt.toISOString().slice(0, 10);
}

/** Human range for a Monday week_start, e.g. "Jun 1 – Jun 7, 2026". */
export function weekRangeLabel(weekStart: string): string {
  const start = ymdToUTC(weekStart);
  const end   = ymdToUTC(shiftWeeks(weekStart, 0, 6));
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const year = end.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'UTC' });
  return `${mon(start)} – ${mon(end)}, ${year}`;
}

function ymdToUTC(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
