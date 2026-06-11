export type Urgency = 'today' | 'this-week' | 'this-month' | 'someday';

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'done';
  due_date: string | null;   // YYYY-MM-DD (date-only string for UI)
  urgency: Urgency;
  sort_order: number;        // within-tier ordering; stored in metadata.sort_order
  created_at: string;
  updated_at: string;
};

export const URGENCY_ORDER: Urgency[] = ['today', 'this-week', 'this-month', 'someday'];

export const URGENCY_LABELS: Record<Urgency, string> = {
  'today':      'Today',
  'this-week':  'This Week',
  'this-month': 'This Month',
  'someday':    'Someday',
};

export const URGENCY_GLYPHS: Record<Urgency, string> = {
  'today':      '●',
  'this-week':  '◕',
  'this-month': '◑',
  'someday':    '○',
};

/** Coerce any stored value into a known Urgency tier (falls back to 'someday')
 *  so a malformed urgency can never produce a task that's counted but unrendered. */
function normalizeUrgency(v: unknown): Urgency {
  return URGENCY_ORDER.includes(v as Urgency) ? (v as Urgency) : 'someday';
}

/** Normalise a Supabase row into a Task. */
export function rowToTask(row: Record<string, unknown>): Task {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const rawDate = row.due_date as string | null | undefined;
  return {
    id:          row.id as string,
    title:       row.title as string,
    description: (row.description as string | null) ?? null,
    status:      (row.status as 'pending' | 'done') ?? 'pending',
    due_date:    rawDate ? rawDate.slice(0, 10) : null,
    urgency:     normalizeUrgency(meta.urgency),
    sort_order:  (meta.sort_order as number) ?? 0,
    created_at:  row.created_at as string,
    updated_at:  row.updated_at as string,
  };
}
