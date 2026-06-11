'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, useDroppable, closestCenter,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDashboard } from '../context';
import { useWellness, useActivities, useWeight, useBiomarkers, useNutrition, useNutritionTargets, useWorkouts } from '../../health/useHealthData';
import { HeroStats }        from '../../health/HeroStats';
import { Icon }             from '../../health/shared';
import { TodayTraining }    from '../../health/TodayTraining';
import { SleepSection }     from '../../health/SleepSection';
import { HeartSection }     from '../../health/HeartSection';
import { WeeklyVolume }     from '../../health/WeeklyVolume';
import { WeightSection }    from '../../health/WeightSection';
import { BiomarkersSection } from '../../health/BiomarkersSection';
import { NutritionSection } from '../../health/NutritionSection';
import { FuelSection }      from '../../health/FuelSection';
import { WeightCard }       from '../../health/WeightCard';
import { SourcesPanel }     from '../../health/SourcesPanel';
import { StepsSection }     from '../../health/StepsSection';

type Section = 'overview' | 'sleep' | 'heart' | 'weight' | 'biomarkers' | 'nutrition' | 'sources';

const SECTIONS: Section[] = ['overview', 'sleep', 'heart', 'weight', 'biomarkers', 'nutrition', 'sources'];

function sectionFromPath(pathname: string): Section {
  const parts = pathname.split('/').filter(Boolean);
  const sub = parts[2] as Section | undefined;
  return sub && SECTIONS.includes(sub) ? sub : 'overview';
}

// Training lives in its own top-rail tab (plan + Strava) — not duplicated here.
const NAV: { id: Section; label: string }[] = [
  { id: 'overview',   label: 'Overview'    },
  { id: 'sleep',      label: 'Sleep'       },
  { id: 'heart',      label: 'Heart'       },
  { id: 'weight',     label: 'Weight'      },
  { id: 'biomarkers', label: 'Biomarkers'  },
  { id: 'nutrition',  label: 'Nutrition'   },
  { id: 'sources',    label: 'Sources'     },
];

// ── Overview card layout (drag-and-drop, mirrors DashboardView) ──────────────

type OverviewCard = 'fuel' | 'weight' | 'steps' | 'sleep' | 'training_cal' | 'volume';
type OverviewLayout = { left: OverviewCard[]; right: OverviewCard[] };

const OVERVIEW_DEFAULT: OverviewLayout = {
  left:  ['fuel', 'steps', 'sleep'],
  right: ['weight', 'training_cal', 'volume'],
};

const OVERVIEW_META: Record<OverviewCard, { title: string; icon: string }> = {
  fuel:         { title: 'Fuel',          icon: 'nutrition' },
  weight:       { title: 'Weight',        icon: 'weight'   },
  steps:        { title: 'Daily Steps',   icon: 'steps'    },
  sleep:        { title: 'Sleep',         icon: 'sleep'    },
  training_cal: { title: 'Training',      icon: 'calendar' },
  volume:       { title: 'Weekly Volume', icon: 'volume'   },
};

// v2: two-column layout object (v1 'health-overview-order' was a flat list)
const LS_OVERVIEW = 'health-overview-layout-v2';

function loadOverviewLayout(): OverviewLayout {
  if (typeof window === 'undefined') return OVERVIEW_DEFAULT;
  try {
    const s = localStorage.getItem(LS_OVERVIEW);
    if (!s) return OVERVIEW_DEFAULT;
    const parsed = JSON.parse(s) as OverviewLayout;
    const known = new Set<OverviewCard>([...OVERVIEW_DEFAULT.left, ...OVERVIEW_DEFAULT.right]);
    const left  = (parsed.left  ?? []).filter(id => known.has(id));
    const right = (parsed.right ?? []).filter(id => known.has(id));
    // Ensure every card is present (handles cards added/removed after save).
    // New cards go to the top of the right column so they're seen, not buried.
    const present = new Set([...left, ...right]);
    const missing = [...known].filter(id => !present.has(id));
    return { left, right: [...missing, ...right] };
  } catch { return OVERVIEW_DEFAULT; }
}

// Columns are droppable themselves so a card can be dragged into an empty one
function DroppableCol({ id, className, children }: {
  id: string; className: string; children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id });
  return <div ref={setNodeRef} className={className} style={{ minHeight: 80 }}>{children}</div>;
}

// ── Sortable card wrapper ─────────────────────────────────────────────────────

function SortableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      className="sortable-card-wrap"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? 'transform 200ms cubic-bezier(.22,.61,.36,1)',
        opacity: isDragging ? 0 : 1,
        position: 'relative',
      }}
    >
      {/* Drag handle — appears on hover via CSS */}
      <button
        {...attributes}
        {...listeners}
        className="drag-handle"
        aria-label="Drag to reorder"
        tabIndex={-1}
        suppressHydrationWarning
      >
        ⠿
      </button>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function HealthDeep() {
  const { setTab } = useDashboard();
  const router     = useRouter();
  const pathname   = usePathname();

  const [section, setSection] = useState<Section>(() => sectionFromPath(pathname ?? ''));

  useEffect(() => {
    setSection(sectionFromPath(pathname ?? ''));
  }, [pathname]);

  const navigateSection = useCallback((s: Section) => {
    setSection(s);
    router.push(`/dashboard/health/${s}`, { scroll: false });
  }, [router]);

  const w   = useWellness();
  const a   = useActivities();
  const wt  = useWeight();
  const bio = useBiomarkers();
  const nut = useNutrition();
  const tgt = useNutritionTargets();
  const wo  = useWorkouts();

  const wellness   = Array.isArray(w.data)   ? w.data   : [];
  const activities = Array.isArray(a.data)   ? a.data   : [];
  const bodyLogs   = Array.isArray(wt.data)  ? wt.data  : [];
  const bioGroups  = Array.isArray(bio.data) ? bio.data : [];
  const nutLogs    = Array.isArray(nut.data) ? nut.data : [];
  const workouts   = Array.isArray(wo.data)  ? wo.data  : [];
  const targets    = tgt.data?.current ?? null;

  const syncStrava = useCallback(() => { a.refetch();  }, [a]);
  const syncGarmin = useCallback(() => { w.refetch();  }, [w]);

  // ── Overview drag-and-drop state ───────────────────────────────────────────

  const [ovLayout, setOvLayout]     = useState<OverviewLayout>(OVERVIEW_DEFAULT);
  const [activeCard, setActiveCard] = useState<OverviewCard | null>(null);

  useEffect(() => { setOvLayout(loadOverviewLayout()); }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function saveOv(l: OverviewLayout) {
    setOvLayout(l);
    localStorage.setItem(LS_OVERVIEW, JSON.stringify(l));
  }

  function findCol(id: OverviewCard): keyof OverviewLayout | null {
    for (const col of ['left', 'right'] as const) {
      if (ovLayout[col].includes(id)) return col;
    }
    return null;
  }

  function onDragStart({ active }: DragStartEvent) {
    setActiveCard(active.id as OverviewCard);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return;
    const overId = over.id as string;
    const ac = findCol(active.id as OverviewCard);
    // over may be a card or a (possibly empty) column
    const oc = (overId === 'left' || overId === 'right')
      ? overId
      : findCol(overId as OverviewCard);
    if (!ac || !oc || ac === oc) return;

    // Move the card to the new column at the right position
    setOvLayout(prev => {
      const item   = active.id as OverviewCard;
      const overId = over.id as OverviewCard;
      const destItems = [...prev[oc]];
      const overIdx   = destItems.indexOf(overId);
      const newDest   = overIdx >= 0
        ? [...destItems.slice(0, overIdx), item, ...destItems.slice(overIdx)]
        : [...destItems, item];
      return {
        ...prev,
        [ac]: prev[ac].filter(i => i !== item),
        [oc]: newDest,
      };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveCard(null);
    if (!over || active.id === over.id) {
      // No movement — persist current (may have been cross-column via onDragOver)
      saveOv(ovLayout);
      return;
    }

    const ac = findCol(active.id as OverviewCard);
    const oc = findCol(over.id as OverviewCard);

    if (!ac) { saveOv(ovLayout); return; }

    if (ac === oc) {
      // Same column: reorder
      const items  = ovLayout[ac];
      const oldIdx = items.indexOf(active.id as OverviewCard);
      const newIdx = items.indexOf(over.id as OverviewCard);
      if (oldIdx !== newIdx) {
        saveOv({ ...ovLayout, [ac]: arrayMove(items, oldIdx, newIdx) });
        return;
      }
    }

    // Cross-column already handled in onDragOver, just persist
    saveOv(ovLayout);
  }

  function renderOverviewCard(id: OverviewCard) {
    switch (id) {
      case 'fuel':         return <FuelSection nutLogs={nutLogs} workouts={workouts} targets={targets}
                                     loading={nut.loading || wo.loading} />;
      case 'weight':       return <WeightCard logs={bodyLogs} targets={targets} loading={wt.loading} />;
      case 'steps':        return <StepsSection wellness={wellness} loading={w.loading} />;
      case 'sleep':        return <SleepSection wellness={wellness} loading={w.loading} />;
      case 'training_cal': return <TodayTraining workouts={workouts} loading={wo.loading} />;
      case 'volume':       return <WeeklyVolume activities={activities} loading={a.loading} />;
    }
  }

  return (
    <div className="scaffold" style={{ '--d': '0s' } as React.CSSProperties}>
      {/* Sidebar */}
      <div className="sidebar">
        {NAV.map(n => (
          <button key={n.id} className={`snav${section === n.id ? ' on' : ''}`}
            onClick={() => navigateSection(n.id)}>
            <span className="g"><Icon id={n.id} size={15} /></span>
            {n.label}
          </button>
        ))}
        <div className="sdiv" />
        <button className="snav" onClick={() => setTab('dashboard')}>
          <span className="g"><Icon id="back" size={15} /></span>Dashboard
        </button>
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <div className="deep-head">
          <div>
            <h1>Health</h1>
            <div className="sub">GARMIN · INTERVALS.ICU · RIVEN</div>
          </div>
          <div className="actions">
            {(w.loading || a.loading || wo.loading) && (
              <span className="chip"><span className="thinking"><i/><i/><i/></span> syncing</span>
            )}
            {w.error && <span className="chip" style={{ color: 'var(--warn)' }}>⚠ Garmin error</span>}
            {a.needsAuth && (
              <a href="/api/health/strava/connect" className="chip"
                style={{ color: 'var(--warn)', textDecoration: 'none' }}>
                ⚠ Reconnect Strava →
              </a>
            )}
            {a.error && !a.needsAuth && (
              <span className="chip" style={{ color: 'var(--warn)' }}>⚠ Strava error</span>
            )}
          </div>
        </div>

        {section === 'overview' && (
          <>
            <HeroStats wellness={wellness} activities={activities} workouts={workouts}
              loading={w.loading || wo.loading} />
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
            >
              <div className="health2">
                {(['left', 'right'] as const).map(col => (
                  <DroppableCol key={col} id={col} className={col === 'left' ? 'stackL' : 'stackR'}>
                    <SortableContext items={ovLayout[col]} strategy={verticalListSortingStrategy}>
                      {ovLayout[col].map(id => (
                        <SortableCard key={id} id={id}>
                          {renderOverviewCard(id)}
                        </SortableCard>
                      ))}
                    </SortableContext>
                  </DroppableCol>
                ))}
              </div>

              <DragOverlay
                dropAnimation={{
                  duration: 200,
                  easing: 'cubic-bezier(.22,.61,.36,1)',
                }}
              >
                {activeCard ? (
                  <div className="card" style={{
                    cursor: 'grabbing',
                    opacity: 0.88,
                    transform: 'scale(1.02) rotate(0.6deg)',
                    boxShadow: '0 32px 80px rgba(0,0,0,.7)',
                    pointerEvents: 'none',
                    padding: '14px 17px',
                    gap: 0,
                  }}>
                    <div className="chead">
                      <div className="glyph" style={{ color: 'var(--accent)' }}>
                        <Icon id={OVERVIEW_META[activeCard].icon} size={16} />
                      </div>
                      <div className="ctitle" style={{ fontSize: 17 }}>{OVERVIEW_META[activeCard].title}</div>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </>
        )}

        {section === 'sleep' && (
          <SleepSection wellness={wellness} loading={w.loading} activities={activities} />
        )}

        {section === 'heart' && (
          <HeartSection wellness={wellness} loading={w.loading} activities={activities} />
        )}

        {section === 'weight' && (
          <WeightSection logs={bodyLogs} loading={wt.loading} onAdded={wt.refetch}
            targets={targets} />
        )}

        {section === 'biomarkers' && (
          <BiomarkersSection groups={bioGroups} loading={bio.loading} onAdded={bio.refetch} />
        )}

        {section === 'nutrition' && (
          <NutritionSection logs={nutLogs} loading={nut.loading} targets={targets} />
        )}

        {section === 'sources' && (
          <SourcesPanel
            wellness={wellness}      activities={activities}
            nutrition={nutLogs}      biomarkers={bioGroups}
            wLoading={w.loading}     aLoading={a.loading}
            stravaError={a.error}    stravaNeedsAuth={a.needsAuth}
            onSyncStrava={syncStrava} onSyncGarmin={syncGarmin}
          />
        )}
      </div>
    </div>
  );
}
