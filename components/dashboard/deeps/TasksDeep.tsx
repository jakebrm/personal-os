'use client';
import { useRef, useState, useEffect, useCallback } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Panel } from '../Panel';
import { useDashboard } from '../context';
import { useTasks } from '../TasksContext';
import {
  URGENCY_ORDER, URGENCY_LABELS, URGENCY_GLYPHS,
  type Urgency, type Task,
} from '@/lib/tasks';

// ── Inline expand/edit panel ──────────────────────────────────────────────────

function ExpandPanel({
  task, onSave, onDelete, onClose,
}: {
  task: Task;
  onSave: (patch: Partial<Pick<Task, 'title' | 'description' | 'due_date' | 'urgency'>>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title,   setTitle]   = useState(task.title);
  const [desc,    setDesc]    = useState(task.description ?? '');
  const [date,    setDate]    = useState(task.due_date ?? '');
  const [urgency, setUrgency] = useState<Urgency>(task.urgency);

  const save = () => {
    onSave({ title: title.trim() || task.title, description: desc.trim() || null, due_date: date || null, urgency });
    onClose();
  };

  return (
    <div className="tsk-expand" onClick={e => e.stopPropagation()}>
      <input className="tsk-expand-title" value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose(); }} autoFocus />
      <textarea className="tsk-expand-notes" placeholder="Add notes…" value={desc}
        onChange={e => setDesc(e.target.value)} rows={2} />
      <div className="tsk-expand-row">
        <span className="tsk-expand-label">Urgency</span>
        <div className="tsk-urgency-btns">
          {URGENCY_ORDER.map(u => (
            <button key={u} className={`tsk-urgency-btn${urgency === u ? ' on' : ''}`} onClick={() => setUrgency(u)}>
              {URGENCY_LABELS[u]}
            </button>
          ))}
        </div>
      </div>
      <div className="tsk-expand-row">
        <span className="tsk-expand-label">Due date</span>
        <input type="date" className="tsk-date-input" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className="tsk-expand-actions">
        <button className="btn" style={{ fontSize: 12, padding: '6px 14px' }} onClick={save}>Save</button>
        <button className="btn ghost" style={{ fontSize: 12, padding: '6px 14px' }} onClick={onClose}>Cancel</button>
        <button className="btn ghost tsk-delete-btn" style={{ fontSize: 12, padding: '6px 14px', marginLeft: 'auto' }} onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

// ── Sortable task row ─────────────────────────────────────────────────────────

function SortableTaskRow({
  task, expanded, onToggle, onExpand, onSave, onDelete,
}: {
  task:     Task;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onSave:   (patch: Partial<Pick<Task, 'title' | 'description' | 'due_date' | 'urgency'>>) => void;
  onDelete: () => void;
}) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? 'transform 180ms cubic-bezier(.22,.61,.36,1)',
        opacity: isDragging ? 0 : 1,
      }}
    >
      <div
        className={`check tsk-row${expanded ? ' tsk-row-open' : ''}`}
        onClick={onExpand}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter') onExpand(); }}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="task-drag-handle"
          aria-label="Drag task"
          tabIndex={-1}
          onClick={e => e.stopPropagation()}
        >
          ⠿
        </button>

        <button
          className={`box${task.status === 'done' ? ' done' : ''}`}
          onClick={e => { e.stopPropagation(); onToggle(); }}
          aria-label={task.status === 'done' ? 'Mark pending' : 'Mark done'}
        />
        <div className={`ct${task.status === 'done' ? ' tsk-done-text' : ''}`}>{task.title}</div>
        {task.due_date && <span className="tsk-due">{task.due_date}</span>}
        <span className="tsk-chevron">{expanded ? '∧' : '∨'}</span>
      </div>

      {expanded && (
        <ExpandPanel task={task} onSave={onSave} onDelete={onDelete} onClose={onExpand} />
      )}
    </div>
  );
}

// ── Sortable task group ───────────────────────────────────────────────────────

function SortableTaskGroup({
  urgency: u, tasks, expandedId, onToggle, onExpand, onSave, onDelete, onAdd,
}: {
  urgency:     Urgency;
  tasks:       Task[];
  expandedId:  string | null;
  onToggle:    (id: string) => void;
  onExpand:    (id: string) => void;
  onSave:      (id: string, p: Partial<Pick<Task, 'title' | 'description' | 'due_date' | 'urgency'>>) => void;
  onDelete:    (id: string) => void;
  onAdd:       (title: string, urgency: Urgency) => void;
}) {
  const addRef = useRef<HTMLInputElement>(null);
  const ids    = tasks.map(t => t.id);

  const handleAdd = () => {
    const val = addRef.current?.value.trim();
    if (!val) return;
    onAdd(val, u);
    if (addRef.current) addRef.current.value = '';
  };

  return (
    <Panel glyph={URGENCY_GLYPHS[u]} title={URGENCY_LABELS[u]} meta={<span className="pill">{tasks.length}</span>}>
      {tasks.length === 0 && <div className="tsk-empty">No tasks here</div>}
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {tasks.map(t => (
          <SortableTaskRow
            key={t.id} task={t}
            expanded={expandedId === t.id}
            onToggle={() => onToggle(t.id)}
            onExpand={() => onExpand(t.id)}
            onSave={p => onSave(t.id, p)}
            onDelete={() => onDelete(t.id)}
          />
        ))}
      </SortableContext>
      <div className="tsk-inline-add">
        <input
          ref={addRef}
          className="hs-input"
          placeholder={`Add to ${URGENCY_LABELS[u].toLowerCase()}…`}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        />
      </div>
    </Panel>
  );
}

// ── Main deep view ────────────────────────────────────────────────────────────

type Filter = Urgency | 'all' | 'done';

export function TasksDeep() {
  const { setTab } = useDashboard();
  const { tasks, loading, addTask, toggleDone, updateTask, deleteTask } = useTasks();

  const [filter,     setFilter]     = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<Task | null>(null);

  // Local order state per urgency tier — keyed by task id, sorted by sort_order
  const [tierOrder, setTierOrder] = useState<Record<Urgency, string[]>>({
    'today': [], 'this-week': [], 'this-month': [], 'someday': [],
  });

  // Sync tier order when tasks change (preserves manual order, adds new tasks at end)
  useEffect(() => {
    setTierOrder(prev => {
      const next = {} as Record<Urgency, string[]>;
      for (const u of URGENCY_ORDER) {
        const fresh = tasks
          .filter(t => t.urgency === u && t.status === 'pending')
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map(t => t.id);
        const prevIds = prev[u] ?? [];
        const merged  = [
          ...prevIds.filter(id => fresh.includes(id)),
          ...fresh.filter(id => !prevIds.includes(id)),
        ];
        next[u] = merged;
      }
      return next;
    });
  }, [tasks]);

  const getTask = useCallback((id: string) => tasks.find(t => t.id === id) ?? null, [tasks]);

  // Map id → its urgency tier
  function findTier(id: string): Urgency | null {
    for (const u of URGENCY_ORDER) {
      if (tierOrder[u].includes(id)) return u;
    }
    return null;
  }

  // Ordered tasks for each tier (filtering pending only)
  function orderedTier(u: Urgency): Task[] {
    return tierOrder[u]
      .map(id => tasks.find(t => t.id === id))
      .filter((t): t is Task => !!t && t.status === 'pending');
  }

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  const open = tasks.filter(t => t.status === 'pending');
  const done = tasks.filter(t => t.status === 'done');

  const counts: Record<string, number> = { all: open.length, done: done.length };
  for (const u of URGENCY_ORDER) counts[u] = open.filter(t => t.urgency === u).length;

  // Single flat filter views
  const flatOpen = filter === 'done' ? [] : filter === 'all' ? open : open.filter(t => t.urgency === filter);
  const flatDone = filter === 'done' ? done : filter === 'all' ? done : done.filter(t => t.urgency === filter);

  const headerInputRef = useRef<HTMLInputElement>(null);
  const handleHeaderAdd = () => {
    const val = headerInputRef.current?.value.trim();
    if (!val) return;
    const urgency: Urgency = URGENCY_ORDER.includes(filter as Urgency) ? (filter as Urgency) : 'today';
    addTask(val, urgency);
    if (headerInputRef.current) headerInputRef.current.value = '';
  };

  // ── DnD handlers ────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart({ active }: DragStartEvent) {
    setActiveDrag(getTask(active.id as string));
    setExpandedId(null); // collapse any open panel during drag
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return;
    const fromTier = findTier(active.id as string);
    const toTier   = findTier(over.id   as string);
    if (!fromTier || !toTier || fromTier === toTier) return;

    // Live preview: move to new tier
    setTierOrder(prev => {
      const item    = active.id as string;
      const overIdx = prev[toTier].indexOf(over.id as string);
      const newDest = overIdx >= 0
        ? [...prev[toTier].slice(0, overIdx), item, ...prev[toTier].slice(overIdx)]
        : [...prev[toTier], item];
      return {
        ...prev,
        [fromTier]: prev[fromTier].filter(id => id !== item),
        [toTier]:   newDest,
      };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveDrag(null);
    if (!over) return;

    const taskId   = active.id as string;
    const fromTier = findTier(taskId);
    const toTier   = findTier(over.id as string);
    if (!fromTier) return;

    if (fromTier === toTier) {
      // Same tier: reorder
      const items  = tierOrder[fromTier];
      const oldIdx = items.indexOf(taskId);
      const newIdx = items.indexOf(over.id as string);
      if (oldIdx === newIdx) return;

      const reordered = arrayMove(items, oldIdx, newIdx);
      setTierOrder(prev => ({ ...prev, [fromTier]: reordered }));

      // Compute a sort_order between neighbors using midpoint insertion
      const prevId = reordered[newIdx - 1];
      const nextId = reordered[newIdx + 1];
      const prevScore = tasks.find(t => t.id === prevId)?.sort_order ?? (newIdx * 1000);
      const nextScore = tasks.find(t => t.id === nextId)?.sort_order ?? ((newIdx + 2) * 1000);
      const newScore  = Math.round((prevScore + nextScore) / 2);

      updateTask(taskId, { sort_order: newScore } as never);
    } else if (toTier) {
      // Cross-tier: urgency change (tier order already updated in onDragOver)
      const destItems = tierOrder[toTier];
      const newIdx    = destItems.indexOf(taskId);
      const prevId    = destItems[newIdx - 1];
      const nextId    = destItems[newIdx + 1];
      const maxScore  = Math.max(0, ...tasks.filter(t => t.urgency === toTier).map(t => t.sort_order ?? 0));
      const prevScore = tasks.find(t => t.id === prevId)?.sort_order ?? maxScore;
      const nextScore = tasks.find(t => t.id === nextId)?.sort_order ?? (maxScore + 2000);
      const newScore  = Math.round((prevScore + nextScore) / 2);

      updateTask(taskId, { urgency: toTier, sort_order: newScore } as never);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="canvas">
      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>

      <div className="deep-head">
        <div>
          <h1>Tasks</h1>
          <div className="sub">{open.length} OPEN · {done.length} DONE</div>
        </div>
      </div>

      <div className="scaffold">
        {/* Sidebar */}
        <aside className="card" style={{ gap: 5, alignSelf: 'start', position: 'sticky', top: 100 }}>
          <div className={`snav${filter === 'all' ? ' on' : ''}`}
            onClick={() => { setFilter('all'); setExpandedId(null); }}>
            <span className="g">◎</span>All open
            <span className="tsk-nav-count">{counts.all}</span>
          </div>
          <div className="sdiv" />
          {URGENCY_ORDER.map(u => (
            <div key={u} className={`snav${filter === u ? ' on' : ''}`}
              onClick={() => { setFilter(u); setExpandedId(null); }}>
              <span className="g">{URGENCY_GLYPHS[u]}</span>
              {URGENCY_LABELS[u]}
              {counts[u] > 0 && <span className="tsk-nav-count">{counts[u]}</span>}
            </div>
          ))}
          <div className="sdiv" />
          <div className={`snav${filter === 'done' ? ' on' : ''}`}
            onClick={() => { setFilter('done'); setExpandedId(null); }}>
            <span className="g">✓</span>Done
            {counts.done > 0 && <span className="tsk-nav-count" style={{ color: 'var(--ok)' }}>{counts.done}</span>}
          </div>
        </aside>

        {/* Main */}
        <div className="stack">
          <div className="tsk-add-bar">
            <input
              ref={headerInputRef}
              className="hs-input"
              placeholder={filter === 'done' || filter === 'all' ? 'New task for today…' : `New task for ${URGENCY_LABELS[filter as Urgency]}…`}
              onKeyDown={e => { if (e.key === 'Enter') handleHeaderAdd(); }}
            />
            <button className="btn" style={{ whiteSpace: 'nowrap', fontSize: 13, padding: '8px 16px' }} onClick={handleHeaderAdd}>
              + Add
            </button>
          </div>

          {loading && <div className="tsk-empty" style={{ padding: '24px 0' }}>Loading tasks…</div>}

          {/* Grouped view with DnD */}
          {!loading && filter === 'all' && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
            >
              {URGENCY_ORDER.map(u => {
                const groupTasks = orderedTier(u);
                if (groupTasks.length === 0) return null;
                return (
                  <SortableTaskGroup
                    key={u}
                    urgency={u}
                    tasks={groupTasks}
                    expandedId={expandedId}
                    onToggle={toggleDone}
                    onExpand={toggleExpand}
                    onSave={updateTask}
                    onDelete={deleteTask}
                    onAdd={addTask}
                  />
                );
              })}
              {open.length === 0 && (
                <div className="card tsk-all-empty">
                  <div className="tsk-empty">All caught up 🎉</div>
                </div>
              )}

              <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.22,.61,.36,1)' }}>
                {activeDrag ? (
                  <div className="check tsk-row" style={{
                    background: 'var(--card-bg-flat)',
                    border: '1px solid var(--card-bd)',
                    borderRadius: 9,
                    cursor: 'grabbing',
                    opacity: 0.9,
                    transform: 'scale(1.015) rotate(0.5deg)',
                    boxShadow: '0 12px 40px rgba(0,0,0,.5)',
                    pointerEvents: 'none',
                    padding: '8px 12px',
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
                    <div className="ct">{activeDrag.title}</div>
                    <span className="chip" style={{ fontSize: 10, flexShrink: 0 }}>{URGENCY_LABELS[activeDrag.urgency]}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {/* Flat single-tier view (no DnD needed — already in grouped view) */}
          {!loading && filter !== 'all' && filter !== 'done' && (
            <Panel glyph={URGENCY_GLYPHS[filter as Urgency]} title={URGENCY_LABELS[filter as Urgency]}
              meta={<span className="pill">{flatOpen.length}</span>}>
              {flatOpen.length === 0 && <div className="tsk-empty">No open tasks here</div>}
              <div>
                {flatOpen.map(t => (
                  <SortableTaskRow
                    key={t.id} task={t}
                    expanded={expandedId === t.id}
                    onToggle={() => toggleDone(t.id)}
                    onExpand={() => toggleExpand(t.id)}
                    onSave={p => updateTask(t.id, p)}
                    onDelete={() => deleteTask(t.id)}
                  />
                ))}
              </div>
            </Panel>
          )}

          {/* Done section */}
          {!loading && flatDone.length > 0 && (
            <Panel glyph="✓" title="Done" meta={<span className="pill">{flatDone.length}</span>}>
              <div>
                {flatDone.map(t => (
                  <SortableTaskRow
                    key={t.id} task={t}
                    expanded={expandedId === t.id}
                    onToggle={() => toggleDone(t.id)}
                    onExpand={() => toggleExpand(t.id)}
                    onSave={p => updateTask(t.id, p)}
                    onDelete={() => deleteTask(t.id)}
                  />
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
