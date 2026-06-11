'use client';
import { useRef } from 'react';
import { Panel } from '../Panel';
import { useTasks } from '../TasksContext';
import { URGENCY_ORDER, URGENCY_LABELS } from '@/lib/tasks';

export function TasksCard({ delay }: { delay?: number }) {
  const { tasks, loading, addTask, toggleDone } = useTasks();
  const inputRef = useRef<HTMLInputElement>(null);

  const open = tasks.filter(t => t.status === 'pending');
  const done = tasks.filter(t => t.status === 'done');

  // Today's open tasks — show up to 4
  const todayOpen = open.filter(t => t.urgency === 'today').slice(0, 4);

  // Counts per urgency for the chip row
  const counts = URGENCY_ORDER.reduce<Record<string, number>>((acc, u) => {
    acc[u] = open.filter(t => t.urgency === u).length;
    return acc;
  }, {});

  const handleAdd = () => {
    const val = inputRef.current?.value.trim();
    if (!val) return;
    addTask(val, 'today');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <Panel
      glyph="☑"
      title="Tasks"
      meta={<span className="pill">{loading ? '…' : `${open.length} open`}</span>}
      deepTab="tasks"
      delay={delay}
    >
      {/* Today's tasks */}
      <div>
        {loading && <div className="tsk-loading">Loading…</div>}

        {!loading && todayOpen.length === 0 && (
          <div className="tsk-empty">No tasks for today</div>
        )}

        {todayOpen.map(t => (
          <div key={t.id} className="check" onClick={e => e.stopPropagation()}>
            <button
              className={`box${t.status === 'done' ? ' done' : ''}`}
              onClick={() => toggleDone(t.id)}
              aria-label={t.status === 'done' ? 'Mark pending' : 'Mark done'}
            />
            <div className={`ct${t.status === 'done' ? ' tsk-done-text' : ''}`}>{t.title}</div>
          </div>
        ))}

        {counts.today > 4 && (
          <div className="check" style={{ paddingLeft: 28 }}>
            <div className="ct" style={{ color: 'var(--mut)', fontSize: 12 }}>
              +{counts.today - 4} more today
            </div>
          </div>
        )}
      </div>

      {/* Urgency counts */}
      <div className="chips">
        {URGENCY_ORDER.filter(u => counts[u] > 0).map(u => (
          <span key={u} className={`chip${u === 'today' ? ' acc' : ''}`}>
            {URGENCY_LABELS[u]} {counts[u]}
          </span>
        ))}
        {done.length > 0 && (
          <span className="chip" style={{ color: 'var(--ok)' }}>✓ {done.length}</span>
        )}
      </div>

      {/* Quick-add input — stopPropagation so click doesn't open deep tab */}
      <div className="tsk-quickadd" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="hs-input"
          placeholder="Add a task for today…"
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        />
      </div>
    </Panel>
  );
}
