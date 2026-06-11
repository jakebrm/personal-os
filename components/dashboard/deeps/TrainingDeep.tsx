'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useTraining, buildWeeks, currentWeekNumber,
  type TrainingWorkout,
} from '../../training/useTrainingData';
import { RaceBanner }    from '../../training/RaceBanner';
import { WeekGrid }      from '../../training/WeekGrid';
import { WorkoutDetail } from '../../training/WorkoutDetail';
import { PlanOverview }  from '../../training/PlanOverview';
import { EffortCard, RunTrendsCard, LiftTrendsCard } from '../../training/StravaInsights';
import { TrainingLog }   from '../../health/TrainingLog';
import { FuelStrip }     from '../../health/FuelSection';
import { useActivities, useStravaZones } from '../../health/useHealthData';
import { homeDateStr }   from '@/lib/dates';

function weekFromUrl(): number | null {
  if (typeof window === 'undefined') return null;
  const n = Number(new URLSearchParams(window.location.search).get('week'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Movable sections — order persisted, race banner stays pinned on top ───────

type SectionId = 'fuel' | 'week' | 'insights' | 'log' | 'overview';
const DEFAULT_ORDER: SectionId[] = ['fuel', 'week', 'insights', 'log', 'overview'];
const ORDER_KEY = 'training-section-order-v1';

function loadOrder(): SectionId[] {
  if (typeof window === 'undefined') return DEFAULT_ORDER;
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]') as SectionId[];
    const known = saved.filter(id => DEFAULT_ORDER.includes(id));
    if (!known.length) return DEFAULT_ORDER;
    return [...known, ...DEFAULT_ORDER.filter(id => !known.includes(id))];
  } catch {
    return DEFAULT_ORDER;
  }
}

function SortableSection({ id, children }: { id: SectionId; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className="sortable-card-wrap"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? 'transform 200ms cubic-bezier(.22,.61,.36,1)',
        opacity: isDragging ? 0.55 : 1,
        zIndex: isDragging ? 5 : undefined,
        position: 'relative',
      }}
    >
      <button {...attributes} {...listeners} className="drag-handle" aria-label="Drag to reorder" tabIndex={-1} suppressHydrationWarning>
        ⠿
      </button>
      {children}
    </div>
  );
}

export function TrainingDeep() {
  const { data, loading, error, isDemo, refetch } = useTraining();

  // Strava — actual training done, alongside the plan
  const acts   = useActivities();
  const zonesQ = useStravaZones();
  const activities = Array.isArray(acts.data) ? acts.data : [];
  const zones      = zonesQ.data?.zones ?? null;

  // Local copy of workouts so completion/notes update optimistically.
  const [workouts, setWorkouts] = useState<TrainingWorkout[]>([]);
  useEffect(() => { setWorkouts(data?.workouts ?? []); }, [data]);

  const weeks = useMemo(() => buildWeeks(workouts), [workouts]);

  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedId, setSelectedId]     = useState<string | null>(null);

  // Section order — loaded after mount (matches the dashboard's hydration-safe pattern)
  const [order, setOrder] = useState<SectionId[]>(DEFAULT_ORDER);
  useEffect(() => { setOrder(loadOrder()); }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setOrder(prev => {
      const next = arrayMove(prev, prev.indexOf(active.id as SectionId), prev.indexOf(over.id as SectionId));
      try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Initialise the week from ?week= (bookmarkable) or today's week, once loaded.
  useEffect(() => {
    if (!weeks.length || selectedWeek !== null) return;
    const fromUrl = weekFromUrl();
    const valid = fromUrl != null && weeks.some(w => w.weekNumber === fromUrl);
    setSelectedWeek(valid ? fromUrl! : currentWeekNumber(weeks));
  }, [weeks, selectedWeek]);

  // Keep the URL query in sync (shareable) without a full navigation.
  useEffect(() => {
    if (selectedWeek == null || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('week', String(selectedWeek));
    window.history.replaceState(null, '', url.toString());
  }, [selectedWeek]);

  const weekIndex = weeks.findIndex(w => w.weekNumber === selectedWeek);
  const week = weekIndex >= 0 ? weeks[weekIndex] : null;
  const currentWeek = weeks.length ? currentWeekNumber(weeks) : 1;

  const goWeek = useCallback((n: number) => {
    setSelectedWeek(n);
    setSelectedId(null);
  }, []);

  const prevWeek = useCallback(() => {
    if (weekIndex > 0) goWeek(weeks[weekIndex - 1].weekNumber);
  }, [weekIndex, weeks, goWeek]);
  const nextWeek = useCallback(() => {
    if (weekIndex >= 0 && weekIndex < weeks.length - 1) goWeek(weeks[weekIndex + 1].weekNumber);
  }, [weekIndex, weeks, goWeek]);

  // Keyboard: ←/→ navigate weeks unless typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prevWeek(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); nextWeek(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevWeek, nextWeek]);

  // ── Mutations (optimistic, then sync) ───────────────────────────────────────
  const patch = useCallback(async (id: string, body: Partial<TrainingWorkout>) => {
    if (isDemo) return;
    try {
      const res = await fetch(`/api/training/workouts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) refetch();   // roll back to server truth on failure
    } catch {
      refetch();
    }
  }, [isDemo, refetch]);

  const toggleComplete = useCallback((id: string, completed: boolean) => {
    setWorkouts(prev => prev.map(w =>
      w.id === id
        ? { ...w, completed, completed_at: completed ? new Date().toISOString() : null }
        : w,
    ));
    patch(id, { completed });
  }, [patch]);

  const saveNotes = useCallback((id: string, notes: string) => {
    setWorkouts(prev => prev.map(w => (w.id === id ? { ...w, notes } : w)));
    patch(id, { notes });
  }, [patch]);

  const selected = selectedId ? workouts.find(w => w.id === selectedId) ?? null : null;

  // ── States ──────────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="tr-page"><div className="card tr-empty">Loading training plan…</div></div>;
  }

  if (error) {
    return (
      <div className="tr-page">
        <div className="card tr-empty">
          <p>Couldn’t load the training plan.</p>
          <p className="tr-faint">{error}</p>
          <button className="tr-complete-btn" onClick={refetch}>Retry</button>
        </div>
      </div>
    );
  }

  if (!data?.plan) {
    return (
      <div className="tr-page">
        <div className="card tr-empty">
          <p>No active training plan yet.</p>
          <p className="tr-faint">Seed the plan from <code>red-white-blue-half-2026-07-18.json</code> to get started.</p>
          <button
            className="tr-complete-btn"
            onClick={async () => {
              await fetch('/api/training/seed', { method: 'POST' });
              refetch();
            }}
          >
            Seed plan
          </button>
        </div>
      </div>
    );
  }

  const today = homeDateStr();
  const plannedToday = workouts
    .filter(w => w.date === today && w.sport !== 'rest')
    .map(w => w.sport);

  // Each movable section's content; null sections are skipped entirely.
  const sections: Record<SectionId, React.ReactNode> = {
    // Today's fuel target — training load drives how much to eat
    fuel: !isDemo ? <FuelStrip plannedSports={plannedToday} /> : null,
    week: week ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <WeekGrid
          week={week}
          weekIndex={weekIndex}
          weekCount={weeks.length}
          selectedId={selectedId}
          onSelect={id => setSelectedId(prev => (prev === id ? null : id))}
          onPrev={prevWeek}
          onNext={nextWeek}
        />
        {selected && (
          <WorkoutDetail
            workout={selected}
            onClose={() => setSelectedId(null)}
            onToggle={toggleComplete}
            onSaveNotes={saveNotes}
          />
        )}
      </div>
    ) : null,
    // What actually happened — straight from Strava
    insights: (
      <div className="tr-insights">
        <EffortCard     activities={activities} loading={acts.loading} />
        <RunTrendsCard  activities={activities} zones={zones} loading={acts.loading || zonesQ.loading} />
        <LiftTrendsCard activities={activities} loading={acts.loading} />
      </div>
    ),
    log: <TrainingLog activities={activities} loading={acts.loading} zones={zones} />,
    overview: (
      <PlanOverview
        weeks={weeks}
        currentWeek={currentWeek}
        selectedWeek={selectedWeek ?? currentWeek}
        onSelectWeek={goWeek}
      />
    ),
  };
  const visibleOrder = order.filter(id => sections[id] != null);

  return (
    <div className="tr-page">
      <RaceBanner plan={data.plan} workouts={workouts} />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visibleOrder} strategy={verticalListSortingStrategy}>
          {visibleOrder.map(id => (
            <SortableSection key={id} id={id}>{sections[id]}</SortableSection>
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
