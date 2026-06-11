'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { timeBits, classifyCmd } from './helpers';
import { useTasks }  from './TasksContext';
import { useDemo }   from './DemoContext';
import { useSettings } from './SettingsContext';
import { buildDemoCalEvents, buildDemoContacts } from '@/lib/demoData';
import { AgendaCard }     from './widgets/AgendaCard';
import { TasksCard }      from './widgets/TasksCard';
import { NotesCard }      from './widgets/NotesCard';
import { FinanceCard }    from './widgets/FinanceCard';
import { HabitsCard }     from './widgets/HabitsCard';
import { HealthCard }     from './widgets/HealthCard';
import { FriendsCard }    from './widgets/FriendsCard';
import { NowPlayingCard } from './widgets/NowPlayingCard';
import { StatsCard }      from './widgets/StatsCard';
import { WeatherCard }    from './widgets/WeatherCard';
import { ReadingCard }    from './widgets/ReadingCard';
import { GoalsCard }      from './widgets/GoalsCard';
import { OperatorCard }   from './widgets/OperatorCard';
import { CalendarCard }   from './widgets/CalendarCard';
import { BrainCard }      from './widgets/BrainCard';
import { WorkLogCard }    from './widgets/WorkLogCard';
import { CrmCard }        from './widgets/CrmCard';
import { FocusCard }      from './widgets/FocusCard';

// ── Card registry ─────────────────────────────────────────────────────────────

type CardComponent = React.ComponentType<{ delay?: number }>;

const CARDS: Record<string, CardComponent> = {
  operator:   OperatorCard,
  agenda:     AgendaCard,
  tasks:      TasksCard,
  notes:      NotesCard,
  calendar:   CalendarCard,
  finance:    FinanceCard,
  habits:     HabitsCard,
  health:     HealthCard,
  friends:    FriendsCard,
  nowplaying: NowPlayingCard,
  stats:      StatsCard,
  weather:    WeatherCard,
  reading:    ReadingCard,
  goals:      GoalsCard,
  brain:      BrainCard,
  worklog:    WorkLogCard,
  crm:        CrmCard,
  focus:      FocusCard,
};

export const CARD_META: Record<string, { title: string; glyph: string }> = {
  operator:   { title: 'Operator',    glyph: '✦' },
  agenda:     { title: 'Agenda',      glyph: '▦' },
  tasks:      { title: 'Tasks',       glyph: '☑' },
  notes:      { title: 'Notes',       glyph: '✎' },
  calendar:   { title: 'Calendar',    glyph: '◈' },
  finance:    { title: 'Finance',     glyph: '$' },
  habits:     { title: 'Habits',      glyph: '◐' },
  health:     { title: 'Health',      glyph: '♡' },
  friends:    { title: 'Friends',     glyph: '❀' },
  nowplaying: { title: 'Now Playing', glyph: '♫' },
  stats:      { title: 'Stats',       glyph: '◈' },
  weather:    { title: 'Weather',     glyph: '◑' },
  reading:    { title: 'Reading',     glyph: '▭' },
  goals:      { title: 'Goals',       glyph: '◎' },
  brain:      { title: 'Brain',       glyph: '◈' },
  worklog:    { title: 'Work Log',    glyph: '▤' },
  crm:        { title: 'CRM',   glyph: '◆' },
  focus:      { title: 'Focus',       glyph: '◉' },
};

// Left-edge accent per widget — palette colors only (blue work/info,
// gold people/consistency, green body/growth). Unlisted cards get blue.
export const CARD_ACCENTS: Record<string, string> = {
  habits:   'var(--accent2)',
  goals:    'var(--accent2)',
  friends:  'var(--accent2)',
  crm:      'var(--accent2)',
  brain:    'var(--accent2)',
  health:   'var(--ok)',
  reading:  'var(--ok)',
  focus:    'var(--ok)',
};

// ── Default layout ────────────────────────────────────────────────────────────

type Layout = { col1: string[]; col2: string[]; col3: string[] };

const DEFAULT_LAYOUT: Layout = {
  col1: ['habits', 'tasks', 'worklog', 'goals'],
  col2: ['calendar', 'health', 'friends'],
  col3: ['stats', 'brain', 'weather', 'reading'],
};

// Bumped to v2 to discard drifted saved layouts and re-apply the default top row
// (habits · calendar · this-week). Older 'dashboard-card-order' values are ignored.
const LS_KEY = 'dashboard-card-order-v2';

// Cards removed from the dashboard (kept in codebase but hidden from layout)
export const REMOVED_CARDS = new Set(['nowplaying', 'finance', 'notes', 'agenda', 'operator']);

function loadLayout(): Layout {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT;
  try {
    const s = localStorage.getItem(LS_KEY);
    if (!s) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(s) as Layout;
    // Strip cards that have been retired
    const strip = (ids: string[]) => ids.filter(id => !REMOVED_CARDS.has(id));
    const cleaned: Layout = {
      col1: strip(parsed.col1),
      col2: strip(parsed.col2),
      col3: strip(parsed.col3),
    };
    // Validate: ensure all active cards are present (handles adding new cards after save)
    const active  = new Set(Object.keys(CARDS).filter(id => !REMOVED_CARDS.has(id)));
    const present = new Set([...cleaned.col1, ...cleaned.col2, ...cleaned.col3]);
    const missing = [...active].filter(id => !present.has(id));
    if (missing.length > 0) {
      return { ...cleaned, col3: [...cleaned.col3, ...missing] };
    }
    return cleaned;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

// ── Sortable card wrapper ─────────────────────────────────────────────────────

function SortableCard({ id, delay }: { id: string; delay?: number }) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id });

  const Card = CARDS[id];
  if (!Card) return null;

  return (
    <div
      ref={setNodeRef}
      className="sortable-card-wrap"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? 'transform 200ms cubic-bezier(.22,.61,.36,1)',
        opacity: isDragging ? 0 : 1,
        position: 'relative',
        ...(CARD_ACCENTS[id] ? { '--card-accent': CARD_ACCENTS[id] } : {}),
      } as React.CSSProperties}
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
      <Card delay={delay} />
    </div>
  );
}

// ── Feed item type ────────────────────────────────────────────────────────────

type FeedItem = { glyph: string; label: string; text: string } | null;

// ── Main view ─────────────────────────────────────────────────────────────────


export function DashboardView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [feed, setFeed]       = useState<FeedItem[]>([]);
  const [thinking, setThinking] = useState(false);
  const [t, setT]             = useState<ReturnType<typeof timeBits> | null>(null);
  const [layout, setLayout]   = useState<Layout>(DEFAULT_LAYOUT);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [calEvents, setCalEvents] = useState<{ start: string; allDay: boolean; calendar?: string }[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);

  const { tasks } = useTasks();
  const { isDemo } = useDemo();
  const { hiddenCards } = useSettings();

  useEffect(() => { setT(timeBits()); }, []);
  useEffect(() => { setLayout(loadLayout()); }, []);

  useEffect(() => {
    if (isDemo) {
      const demoEvents = buildDemoCalEvents();
      setCalEvents(demoEvents);
      const demoContacts = buildDemoContacts();
      setOverdueCount(demoContacts.filter(c => c.overdue).length);
      return;
    }
    fetch('/api/calendar').then(r => r.ok ? r.json() : { events: [] })
      .then(d => setCalEvents(d.events ?? [])).catch(() => {});
    fetch('/api/friends').then(r => r.ok ? r.json() : { friends: [] })
      .then(d => setOverdueCount((d.friends ?? []).filter((f: { overdue: boolean }) => f.overdue).length))
      .catch(() => {});
  }, [isDemo]);

  function save(l: Layout) {
    setLayout(l);
    localStorage.setItem(LS_KEY, JSON.stringify(l));
  }

  function findCol(id: string): keyof Layout | null {
    for (const col of ['col1', 'col2', 'col3'] as const) {
      if (layout[col].includes(id)) return col;
    }
    return null;
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return;
    const ac = findCol(active.id as string);
    const oc = findCol(over.id as string);
    if (!ac || !oc || ac === oc) return;

    // Move the card to the new column at the right position
    setLayout(prev => {
      const item   = active.id as string;
      const overId = over.id as string;
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
    setActiveId(null);
    if (!over || active.id === over.id) {
      // No movement — persist current (may have been cross-column via onDragOver)
      save(layout);
      return;
    }

    const ac = findCol(active.id as string);
    const oc = findCol(over.id as string);

    if (!ac) { save(layout); return; }

    if (ac === oc) {
      // Same column: reorder
      const items  = layout[ac];
      const oldIdx = items.indexOf(active.id as string);
      const newIdx = items.indexOf(over.id as string);
      if (oldIdx !== newIdx) {
        save({ ...layout, [ac]: arrayMove(items, oldIdx, newIdx) });
        return;
      }
    }

    // Cross-column already handled in onDragOver, just persist
    save(layout);
  }

  function runCommand(text: string) {
    const trimmed = text.trim(); if (!trimmed) return;
    const [, glyph, label] = classifyCmd(trimmed);
    setThinking(true);
    setFeed(prev => [null, ...prev].slice(0, 3));
    setTimeout(() => {
      setThinking(false);
      setFeed(prev => [{ glyph, label, text: trimmed }, ...prev.slice(1)].slice(0, 3));
    }, 700);
    if (inputRef.current) inputRef.current.value = '';
  }

  const d = (n: number) => (Math.min(n, 12) * 0.022);

  const todayStr     = new Intl.DateTimeFormat('en-CA').format(new Date());
  const todayEvents  = calEvents.filter(e => !e.calendar && e.start.startsWith(todayStr));
  const eventCount   = todayEvents.length;
  const pendingCount = tasks.filter(tk => tk.status === 'pending').length;
  // Cards the user has hidden via Settings are kept in the layout (so order is
  // preserved when re-shown) but filtered out of the render.
  const visibleCol = (col: keyof Layout) => layout[col].filter(id => !hiddenCards.has(id));
  const widgetCount  = visibleCol('col1').length + visibleCol('col2').length + visibleCol('col3').length;

  const now2 = new Date();
  const nextEvent = calEvents
    .filter(e => !e.allDay && !e.calendar && new Date(e.start) > now2)
    .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
  const nextLabel = nextEvent
    ? (() => {
        const mins = Math.round((new Date(nextEvent.start).getTime() - now2.getTime()) / 60000);
        if (mins < 60) return `◷ next in ${mins}m`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `◷ next in ${h}h${m > 0 ? ` ${m}m` : ''}`;
      })()
    : null;

  return (
    <div className="canvas">
      <section className="cmd-hero" style={{ '--d': `${d(1).toFixed(3)}s` } as React.CSSProperties}>
        <div className="greet">
          <div>
            <div className="gh">{t?.greet ?? 'Hello'}, {process.env.NEXT_PUBLIC_OWNER_NAME || 'friend'}</div>
            <div className="gsub">
              {t ? `${t.date.toUpperCase()} · ${t.clock} ${t.ap} · ` : ''}
              {eventCount} EVENT{eventCount !== 1 ? 'S' : ''} · {pendingCount} TASK{pendingCount !== 1 ? 'S' : ''}{overdueCount > 0 ? ` · ${overdueCount} FRIEND${overdueCount !== 1 ? 'S' : ''} DUE` : ''}
            </div>
          </div>
          <div className="gquick">
            {nextLabel && <span className="chip acc">{nextLabel}</span>}
            <span className="chip">▦ {widgetCount} widget{widgetCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="cmd">
          <div className="spark">✦</div>
          <input
            ref={inputRef}
            autoComplete="off"
            placeholder="Tell your OS anything — a task, a friend to call, what you ate, a thought…"
            onKeyDown={e => { if (e.key === 'Enter') runCommand((e.target as HTMLInputElement).value); }}
          />
          <button className="send" onClick={() => inputRef.current && runCommand(inputRef.current.value)}>⏎</button>
        </div>
        {(thinking || feed.length > 0) && (
          <div className="cmd-feed">
            {thinking && (
              <div className="cap-row">
                <div className="thinking"><i /><i /><i /></div>
                <span className="ctxt" style={{ color: 'var(--faint)' }}>routing…</span>
              </div>
            )}
            {feed.filter(Boolean).map((item, i) => item && (
              <div key={i} className="cap-row">
                <div className="ct">{item.glyph}</div>
                <div className="ctxt">Saved to <b>{item.label}</b> — &ldquo;{item.text}&rdquo;</div>
                <div className="route">→ {item.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="cols3">
          {(['col1', 'col2', 'col3'] as const).map((col, ci) => {
            const ids = visibleCol(col);
            return (
              <div key={col} className="col">
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  {ids.map((id, i) => (
                    <SortableCard key={id} id={id} delay={d(ci * 6 + i + 2)} />
                  ))}
                </SortableContext>
              </div>
            );
          })}
        </div>

        <DragOverlay
          dropAnimation={{
            duration: 200,
            easing: 'cubic-bezier(.22,.61,.36,1)',
          }}
        >
          {activeId && CARD_META[activeId] ? (
            <div className="card" style={{
              cursor: 'grabbing',
              opacity: 0.88,
              transform: 'scale(1.02) rotate(0.6deg)',
              boxShadow: '0 32px 80px rgba(0,0,0,.7)',
              pointerEvents: 'none',
              padding: '14px 17px',
              gap: 0,
              ...(CARD_ACCENTS[activeId] ? { '--card-accent': CARD_ACCENTS[activeId] } : {}),
            } as React.CSSProperties}>
              <div className="chead">
                <div className="glyph">{CARD_META[activeId].glyph}</div>
                <div className="ctitle">{CARD_META[activeId].title}</div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
