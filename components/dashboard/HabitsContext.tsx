'use client';
import {
  createContext, useCallback, useContext,
  useEffect, useRef, useState,
} from 'react';
import {
  DEFAULT_HABITS, type HabitDef,
  localDateKey, calcStreak,
  lsRead, lsWrite, lsReadConfig, lsWriteConfig,
} from '@/lib/habits';
import { useDemo } from './DemoContext';
import { DEMO_HABITS, DEMO_HABITS_DONE, buildDemoHabitsHistory } from '@/lib/demoData';

// ── Context shape ─────────────────────────────────────────────────────────────

type HabitsCtx = {
  habits:  HabitDef[];
  done:    string[];                   // today's completed habit IDs
  history: Map<string, string[]>;      // date → done IDs (includes today)
  loading: boolean;
  toggle:       (id: string) => void;
  setHabits:    (habits: HabitDef[]) => Promise<void>;
  setDateDone:  (date: string, done: string[]) => Promise<void>;
};

const Ctx = createContext<HabitsCtx | null>(null);

export function useHabits(): HabitsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useHabits must be used inside HabitsProvider');
  return ctx;
}

// ── Auto-sync matching ────────────────────────────────────────────────────────
// Maps external-data flags to the user's actual habit ids by id/label pattern,
// so it works even when habits are customized (e.g. "Exercise" → id `run`,
// "Read" → id `read_ry92`). Shared by the apply logic and the "auto" badge.

export type AutoSyncKind = 'sleep' | 'read' | 'exercise';
type AutoSyncFlags = Partial<Record<AutoSyncKind, boolean>>;

const AUTO_MATCHERS: Record<AutoSyncKind, (h: HabitDef) => boolean> = {
  sleep:    h => /^sleep/i.test(h.id) || /sleep/i.test(h.label),
  read:     h => /^read/i.test(h.id)  || /read/i.test(h.label),
  exercise: h => ['run', 'workout', 'exercise', 'lift'].includes(h.id)
              || /(exercise|workout|gym|training|lift)/i.test(h.label),
};

function autoSyncIds(habitList: HabitDef[], flags: AutoSyncFlags): string[] {
  const ids: string[] = [];
  (Object.keys(AUTO_MATCHERS) as AutoSyncKind[]).forEach(kind => {
    if (!flags[kind]) return;
    const h = habitList.find(AUTO_MATCHERS[kind]);
    if (h) ids.push(h.id);
  });
  return ids;
}

function autoSyncKindFor(habit: HabitDef): AutoSyncKind | null {
  if (AUTO_MATCHERS.sleep(habit))    return 'sleep';
  if (AUTO_MATCHERS.read(habit))     return 'read';
  if (AUTO_MATCHERS.exercise(habit)) return 'exercise';
  return null;
}

const AUTO_SYNC_TOOLTIP: Record<AutoSyncKind, string> = {
  sleep:    'Auto-syncs from Garmin (≥7 hrs sleep)',
  read:     'Auto-syncs from Reading tab',
  exercise: 'Auto-syncs from a logged Strava/Garmin activity',
};

// ── Provider ──────────────────────────────────────────────────────────────────

export function HabitsProvider({ children }: { children: React.ReactNode }) {
  const today = localDateKey(); // local clock — never UTC
  const { isDemo, notifyWrite } = useDemo();
  const isDemoRef = useRef(false);
  isDemoRef.current = isDemo;

  // Start with defaults on both server and client so hydration always matches.
  // localStorage is loaded in useEffect (client-only) to avoid SSR mismatches.
  const [habits,  setHabitsState] = useState<HabitDef[]>(DEFAULT_HABITS);
  const [done,    setDone]        = useState<string[]>([]);
  const [history, setHistory]     = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading]     = useState(true);

  // Keep a mutable ref to done so the debounced sync always reads latest
  const doneRef    = useRef<string[]>(done);
  doneRef.current  = done;
  const syncTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Latest habit list + last auto-sync flags, so we can re-map flags → ids
  // whenever the (possibly customized) habit config finishes loading.
  const habitsRef    = useRef<HabitDef[]>(habits);
  habitsRef.current  = habits;
  const autoFlagsRef = useRef<AutoSyncFlags>({});

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isDemo) {
      setHabitsState(DEMO_HABITS);
      doneRef.current = DEMO_HABITS_DONE;
      setDone(DEMO_HABITS_DONE);
      setHistory(buildDemoHabitsHistory());
      setLoading(false);
      return;
    }

    let cancelled = false;

    // Seed from localStorage immediately (client-only, runs after hydration)
    const cached = lsReadConfig();
    if (cached) setHabitsState(cached);
    const todayDone = lsRead(today);
    if (todayDone.length > 0) {
      doneRef.current = todayDone;
      setDone(todayDone);
    }

    // Merge auto-synced IDs into done state (idempotent — only adds, never removes)
    const applyAutoSync = (ids: string[]) => {
      if (cancelled || ids.length === 0) return;
      const next = Array.from(new Set([...doneRef.current, ...ids]));
      if (next.length > doneRef.current.length) {
        doneRef.current = next;
        setDone(next);
        lsWrite(today, next);
        // Persist to the server so date-based goals (e.g. "read N days this
        // month") count auto-completed habits, not just manually-tapped ones.
        if (!isDemoRef.current) {
          fetch(`/api/habits/${today}`, {
            method:  'POST',
            headers: { 'content-type': 'application/json' },
            body:    JSON.stringify({ done: next }),
          }).catch(() => {});
        }
      }
    };

    // Habit config from Supabase (override localStorage if server has it)
    fetch('/api/habits/config')
      .then(r => r.json())
      .then(({ habits: h }: { habits: HabitDef[] | null }) => {
        if (cancelled || !Array.isArray(h) || h.length === 0) return;
        lsWriteConfig(h);
        setHabitsState(h);
        habitsRef.current = h;
        // Re-map any auto-sync flags now that the real (customized) ids are known
        applyAutoSync(autoSyncIds(h, autoFlagsRef.current));
      })
      .catch(() => {});

    // 90-day log history
    fetch('/api/habits?days=90')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(({ logs }: { logs: { date: string; done: string[] }[] }) => {
        if (cancelled) return;
        const map = new Map<string, string[]>();
        for (const log of logs) map.set(log.date, log.done);
        setHistory(map);

        // Seed today from server only if localStorage is empty
        const ls = lsRead(today);
        if (ls.length === 0 && map.has(today)) {
          const srv = map.get(today)!;
          doneRef.current = srv;
          setDone(srv);
          lsWrite(today, srv);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    // Auto-sync: sleep from Garmin, read from books progress, exercise from
    // Strava/Garmin activities. Pass local date so server doesn't use UTC
    // (wellness logs store local dates). Flags are mapped to the user's actual
    // (possibly customized) habit ids — and re-mapped once config loads.
    fetch(`/api/habits/auto-sync?date=${today}`)
      .then(r => r.json())
      .then((flags: AutoSyncFlags) => {
        autoFlagsRef.current = flags;
        applyAutoSync(autoSyncIds(habitsRef.current, flags));
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [isDemo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle a habit ──────────────────────────────────────────────────────────
  const toggle = useCallback((id: string) => {
    // Read from ref so rapid clicks always chain off the latest state
    const next = doneRef.current.includes(id)
      ? doneRef.current.filter(x => x !== id)
      : [...doneRef.current, id];

    doneRef.current = next;   // update ref immediately
    setDone(next);            // schedule re-render
    if (!isDemoRef.current) lsWrite(today, next);

    if (isDemoRef.current) {
      notifyWrite();
      return;
    }

    // Debounced Supabase POST: fires 600ms after the last click
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      fetch(`/api/habits/${today}`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ done: doneRef.current }),
      })
        .then(() => {
          // Water habit writes through to nutrition_logs — refresh the Fuel card
          if (id === 'water') window.dispatchEvent(new CustomEvent('health:refetch', { detail: 'nutrition' }));
        })
        .catch(() => {});
    }, 600);
  }, [today, notifyWrite]);

  // ── Set done list for a specific past date ──────────────────────────────────
  const setDateDone = useCallback(async (date: string, doneIds: string[]) => {
    setHistory(prev => { const next = new Map(prev); next.set(date, doneIds); return next; });
    if (isDemoRef.current) { notifyWrite(); return; }
    lsWrite(date, doneIds);
    await fetch(`/api/habits/${date}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done: doneIds }),
    }).catch(() => {});
    window.dispatchEvent(new CustomEvent('health:refetch', { detail: 'nutrition' }));
  }, []);

  // ── Update habit config ─────────────────────────────────────────────────────
  const setHabits = useCallback(async (newHabits: HabitDef[]) => {
    if (isDemoRef.current) { setHabitsState(newHabits); notifyWrite(); return; }
    // Remove done IDs that belong to deleted habits
    const validIds  = new Set(newHabits.map(h => h.id));
    const cleanDone = doneRef.current.filter(id => validIds.has(id));
    if (cleanDone.length !== doneRef.current.length) {
      doneRef.current = cleanDone;
      setDone(cleanDone);
      lsWrite(today, cleanDone);
    }

    setHabitsState(newHabits);
    lsWriteConfig(newHabits);

    await fetch('/api/habits/config', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ habits: newHabits }),
    }).catch(() => {});
  }, [today]);

  // Merge today's live state into history so streak / heatmap calcs stay fresh
  const historyWithToday = new Map(history);
  historyWithToday.set(today, done);

  return (
    <Ctx.Provider value={{ habits, done, history: historyWithToday, loading, toggle, setHabits, setDateDone }}>
      {children}
    </Ctx.Provider>
  );
}

// ── Shared ring button ────────────────────────────────────────────────────────
// Exported so both HabitsCard and HabitsDeep render identical buttons.

const R    = 15.5;
const CIRC = parseFloat((2 * Math.PI * R).toFixed(1)); // ~97.4

export function HabitRingBtn({
  habit, done, streak, onToggle,
}: {
  habit:    HabitDef;
  done:     boolean;
  streak:   number;
  onToggle: () => void;
}) {
  const off = done ? 0 : CIRC;
  const sub = done ? '✓ done' : streak > 0 ? `${streak}d streak` : 'tap to log';

  const autoKind = autoSyncKindFor(habit);

  return (
    <button
      className={`habit${done ? ' done' : ''}`}
      onClick={onToggle}
      aria-pressed={done}
    >
      <span className="hring">
        <svg viewBox="0 0 40 40">
          <circle className="ht" cx="20" cy="20" r={R} />
          <circle className="hf" cx="20" cy="20" r={R}
            strokeDasharray={CIRC} strokeDashoffset={off} />
        </svg>
      </span>
      <span className="hlabel">
        <span className="hn" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {habit.label}
          {autoKind && (
            <span
              title={AUTO_SYNC_TOOLTIP[autoKind]}
              style={{
                fontSize: 8, fontWeight: 700, letterSpacing: '.05em',
                color: 'var(--accent)', opacity: 0.7,
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent-glow)',
                borderRadius: 4, padding: '1px 4px',
                fontFamily: 'var(--sans)', textTransform: 'uppercase',
              }}
            >auto</span>
          )}
        </span>
        <span className="hv">{sub}</span>
      </span>
    </button>
  );
}

// Re-export calcStreak for convenience so callers only need one import
export { calcStreak };
