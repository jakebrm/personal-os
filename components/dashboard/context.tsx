'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export type HabitKind = 'count' | 'toggle';
export type Habit = {
  label: string; type: HabitKind; cur: number;
  goal?: number; unit?: string; step?: number; glyph: string;
};

const INITIAL: Record<string, Habit> = {
  water:    { label: 'Water',    type: 'count',  cur: 5,  goal: 8,  unit: '',  step: 1, glyph: '◐' },
  read:     { label: 'Read',     type: 'count',  cur: 15, goal: 30, unit: 'm', step: 5, glyph: '▭' },
  meditate: { label: 'Meditate', type: 'toggle', cur: 0,                                glyph: '◓' },
  vitamins: { label: 'Vitamins', type: 'toggle', cur: 1,                                glyph: '✚' },
};

export const hPct  = (h: Habit) => h.type === 'toggle' ? (h.cur ? 100 : 0) : Math.min(100, Math.round(h.cur / h.goal! * 100));
export const hVal  = (h: Habit) => h.type === 'toggle' ? (h.cur ? 'done' : 'tap to log') : `${h.cur}/${h.goal}${h.unit}`;
export const hDone = (h: Habit) => Boolean((h.type === 'toggle' && h.cur) || (h.type === 'count' && h.cur >= (h.goal ?? 0)));

type Ctx = {
  tab: string;
  setTab: (t: string) => void;
  habits: Record<string, Habit>;
  logHabit: (id: string) => void;
};

const DashCtx = createContext<Ctx | null>(null);

// ── URL helpers ────────────────────────────────────────────────────────────────

/** Extract the top-level tab name from a /dashboard/* pathname. */
function pathToTab(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  // ['dashboard'] → 'dashboard'
  // ['dashboard', 'health'] → 'health'
  // ['dashboard', 'health', 'sleep'] → 'health'
  if (parts[0] === 'dashboard' && parts[1]) return parts[1];
  return 'dashboard';
}

function tabToPath(tab: string): string {
  return tab === 'dashboard' ? '/dashboard' : `/dashboard/${tab}`;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  // Init from current URL so a refresh to /dashboard/health opens Health directly
  const [tab,    setTabState] = useState(() => pathToTab(pathname ?? '/dashboard'));
  const [habits, setHabits]   = useState<Record<string, Habit>>(INITIAL);

  // Keep tab state in sync when the URL changes externally (browser back/forward,
  // or when a sub-view (e.g. HealthDeep section) pushes a deeper URL).
  useEffect(() => {
    const fromUrl = pathToTab(pathname ?? '/dashboard');
    setTabState(prev => prev === fromUrl ? prev : fromUrl);
  }, [pathname]);

  const setTab = useCallback((t: string) => {
    // Update state immediately for instant visual feedback + animation trigger
    setTabState(t);
    // Push to history so back/forward works
    router.push(tabToPath(t), { scroll: false });
  }, [router]);

  const logHabit = useCallback((id: string) => {
    setHabits(prev => {
      const h = prev[id]; if (!h) return prev;
      let cur: number;
      if (h.type === 'toggle') cur = h.cur ? 0 : 1;
      else { cur = h.cur + (h.step ?? 1); if (cur > h.goal!) cur = 0; }
      return { ...prev, [id]: { ...h, cur } };
    });
  }, []);

  return <DashCtx.Provider value={{ tab, setTab, habits, logHabit }}>{children}</DashCtx.Provider>;
}

export function useDashboard() {
  const ctx = useContext(DashCtx);
  if (!ctx) throw new Error('useDashboard outside DashboardProvider');
  return ctx;
}
