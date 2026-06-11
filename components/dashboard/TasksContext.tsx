'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { type Task, type Urgency } from '@/lib/tasks';
import { useDemo }     from './DemoContext';
import { DEMO_TASKS }  from '@/lib/demoData';

// ── Context shape ─────────────────────────────────────────────────────────────

type TasksCtx = {
  tasks:      Task[];
  loading:    boolean;
  addTask:    (title: string, urgency: Urgency) => Promise<void>;
  toggleDone: (id: string) => Promise<void>;
  updateTask: (id: string, patch: Partial<Pick<Task, 'title'|'description'|'due_date'|'urgency'|'sort_order'>>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
};

const Ctx = createContext<TasksCtx | null>(null);

export function useTasks(): TasksCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTasks must be used inside TasksProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const { isDemo, notifyWrite } = useDemo();
  const isDemoRef = useRef(false);
  isDemoRef.current = isDemo;

  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const seeded = useRef(false);

  useEffect(() => {
    if (isDemo) {
      seeded.current = true;
      setTasks(DEMO_TASKS);
      setLoading(false);
      return;
    }
    seeded.current = false;
    let cancelled = false;

    fetch('/api/tasks')
      .then(async r => {
        if (r.status === 307 || r.url.includes('/login')) {
          window.location.href = '/login';
          return null;
        }
        return r.json() as Promise<{ tasks: Task[] }>;
      })
      .then(json => {
        if (!json || cancelled) return;
        if (!Array.isArray(json.tasks)) return;
        if (seeded.current) return;
        seeded.current = true;
        setTasks(json.tasks);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isDemo]); // re-run when demo mode toggles

  // ── add ───────────────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const addTask = useCallback(async (title: string, urgency: Urgency) => {
    const now = new Date().toISOString();
    if (isDemoRef.current) {
      notifyWrite();
      const task: Task = { id:`demo-${Date.now()}`, title, description:null, status:'pending', due_date:null, urgency, sort_order:0, created_at:now, updated_at:now };
      setTasks(prev => [task, ...prev]);
      return;
    }
    const tmpId = `tmp-${Date.now()}`;
    const optimistic: Task = {
      id: tmpId, title, description: null, status: 'pending',
      due_date: null, urgency, sort_order: 0, created_at: now, updated_at: now,
    };
    setTasks(prev => [optimistic, ...prev]);

    const res = await fetch('/api/tasks', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ title, urgency }),
    });

    if (res.status === 307 || res.url.includes('/login')) {
      setTasks(prev => prev.filter(t => t.id !== tmpId));
      window.location.href = '/login';
      return;
    }

    if (res.ok) {
      try {
        const { task } = (await res.json()) as { task: Task };
        setTasks(prev => prev.map(t => t.id === tmpId ? task : t));
      } catch {
        setTasks(prev => prev.filter(t => t.id !== tmpId));
      }
    } else {
      setTasks(prev => prev.filter(t => t.id !== tmpId));
    }
  }, []);

  // ── toggle ────────────────────────────────────────────────────────────────
  const toggleDone = useCallback(async (id: string) => {
    const original = tasks.find(t => t.id === id);
    if (!original) return;
    const newStatus = original.status === 'done' ? 'pending' : 'done';

    setTasks(prev => prev.map(t => t.id === id
      ? { ...t, status: newStatus, updated_at: new Date().toISOString() }
      : t));

    if (isDemoRef.current) { notifyWrite(); return; }

    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) setTasks(prev => prev.map(t => t.id === id ? original : t));
  }, [tasks]);

  // ── update ────────────────────────────────────────────────────────────────
  const updateTask = useCallback(async (
    id: string,
    patch: Partial<Pick<Task, 'title'|'description'|'due_date'|'urgency'|'sort_order'>>,
  ) => {
    const original = tasks.find(t => t.id === id);
    if (!original) return;

    setTasks(prev => prev.map(t => t.id === id
      ? { ...t, ...patch, updated_at: new Date().toISOString() }
      : t));

    if (isDemoRef.current) { notifyWrite(); return; }

    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) setTasks(prev => prev.map(t => t.id === id ? original : t));
  }, [tasks]);

  // ── delete ────────────────────────────────────────────────────────────────
  const deleteTask = useCallback(async (id: string) => {
    const original = tasks.find(t => t.id === id);
    setTasks(prev => prev.filter(t => t.id !== id));

    if (isDemoRef.current) { notifyWrite(); return; }

    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (!res.ok && original) setTasks(prev => [...prev, original]);
  }, [tasks]);

  return (
    <Ctx.Provider value={{ tasks, loading, addTask, toggleDone, updateTask, deleteTask }}>
      {children}
    </Ctx.Provider>
  );
}
