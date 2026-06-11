'use client';
import {
  createContext, useCallback, useContext,
  useEffect, useRef, useState,
} from 'react';
import type { GoalWithProgress, Goal } from '@/lib/goals';
import { useDemo }           from './DemoContext';
import { buildDemoGoals }    from '@/lib/demoData';

type GoalsCtx = {
  goals:   GoalWithProgress[];
  loading: boolean;
  addGoal:    (fields: Partial<Goal>) => Promise<void>;
  updateGoal: (id: string, patch: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  logProgress:(id: string, value: number, date?: string, note?: string) => Promise<void>;
  refresh:    () => void;
};

const Ctx = createContext<GoalsCtx | null>(null);

export function useGoals(): GoalsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGoals must be inside GoalsProvider');
  return ctx;
}

export function GoalsProvider({ children }: { children: React.ReactNode }) {
  const { isDemo, notifyWrite } = useDemo();
  const isDemoRef = useRef(false);
  isDemoRef.current = isDemo;

  const [goals,   setGoals]   = useState<GoalWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick,    setTick]    = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (isDemo) { setGoals(buildDemoGoals()); setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    fetch('/api/goals')
      .then(r => r.json())
      .then(({ goals: g }: { goals: GoalWithProgress[] }) => {
        if (!cancelled) setGoals(g ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tick, isDemo]);

  const addGoal = useCallback(async (fields: Partial<Goal>) => {
    if (isDemoRef.current) { notifyWrite(); return; }
    const res  = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fields),
    });
    const json = await res.json() as { goal?: GoalWithProgress; error?: string };
    if (!res.ok || json.error) throw new Error(json.error ?? 'Failed to create goal');
    if (json.goal) setGoals(prev => [...prev, json.goal!]);
  }, []);

  const updateGoal = useCallback(async (id: string, patch: Partial<Goal>) => {
    if (isDemoRef.current) { notifyWrite(); return; }
    const res  = await fetch(`/api/goals/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await res.json() as { goal?: GoalWithProgress; error?: string };
    if (!res.ok || json.error) throw new Error(json.error ?? 'Failed to update goal');
    // Abandoned/completed-status goals leave the active list (matches the GET filter)
    if (json.goal) {
      setGoals(prev => json.goal!.status === 'active'
        ? prev.map(g => g.id === id ? json.goal! : g)
        : prev.filter(g => g.id !== id));
    }
  }, []);

  const deleteGoal = useCallback(async (id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
    if (isDemoRef.current) { notifyWrite(); return; }
    await fetch(`/api/goals/${id}`, { method: 'DELETE' });
  }, [notifyWrite]);

  const logProgress = useCallback(async (id: string, value: number, date?: string, note?: string) => {
    if (isDemoRef.current) { notifyWrite(); return; }
    await fetch(`/api/goals/${id}/progress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value, date, note }),
    });
    refresh();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ goals, loading, addGoal, updateGoal, deleteGoal, logProgress, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
