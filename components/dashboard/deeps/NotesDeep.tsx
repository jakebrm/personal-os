'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Cell, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
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
import { useDemo } from '../DemoContext';
import { Panel } from '../Panel';
import { useHabits, HabitRingBtn, calcStreak } from '../HabitsContext';
import { useGoals } from '../GoalsContext';
import { CATEGORY_META, type GoalWithProgress } from '@/lib/goals';
import { Tile, Seg, TOOLTIP_STYLE, TOOLTIP_LABEL, TOOLTIP_ITEM, PAL } from '@/components/health/shared';
import { localDateKey, dateToKey, lastNDays } from '@/lib/habits';
import { buildDemoJournal } from '@/lib/demoData';

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const WDAY_LABELS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildGrid(year: number, month: number): (string | null)[] {
  const firstDow = new Date(year, month, 1).getDay();
  const offset   = (firstDow + 6) % 7;
  const total    = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= total; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function fmtHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt  = new Date(y, m - 1, d);
  const dow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dt.getDay()];
  return `${dow}, ${MONTH_NAMES[m - 1]} ${d}`;
}

// ── Entry type ────────────────────────────────────────────────────────────────

type JournalEntry = { content: string; habits: string[]; mood?: number | null };
type StatDay      = { date: string; words: number; mood: number | null };

const countWords = (s: string) => { const t = s.trim(); return t ? t.split(/\s+/).length : 0; };

// ── Mood scale (1–5, the classic daily-log dimension) ────────────────────────

const MOOD_META = [
  { v: 1, label: 'rough', color: 'var(--danger)' },
  { v: 2, label: 'meh',   color: 'var(--warn)' },
  { v: 3, label: 'okay',  color: 'var(--mut)' },
  { v: 4, label: 'good',  color: 'var(--accent2)' },
  { v: 5, label: 'great', color: 'var(--ok)' },
] as const;
const moodColor = (v: number) => MOOD_META[Math.min(4, Math.max(0, v - 1))].color;
const moodLabel = (v: number) => MOOD_META[Math.min(4, Math.max(0, v - 1))].label;

function MoodPicker({ value, onSelect }: {
  value: number | null;
  onSelect: (v: number | null) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
      <span style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>
        Mood
      </span>
      <div style={{ display: 'flex', gap: 5 }}>
        {MOOD_META.map(m => {
          const on = value === m.v;
          return (
            <button
              key={m.v} title={m.label}
              onClick={() => onSelect(on ? null : m.v)}
              style={{
                width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${on ? m.color : 'var(--card-bd)'}`,
                background: on ? `color-mix(in oklch, ${m.color}, transparent 72%)` : 'transparent',
                transition: 'all .15s',
              }}
            >
              <span style={{
                width: on ? 10 : 7, height: on ? 10 : 7, borderRadius: '50%',
                background: on ? m.color : 'var(--faint)', transition: 'all .15s',
              }} />
            </button>
          );
        })}
      </div>
      {value != null && (
        <span style={{ fontSize: 11, fontWeight: 600, color: moodColor(value) }}>{moodLabel(value)}</span>
      )}
    </div>
  );
}

// ── Calendar grid ─────────────────────────────────────────────────────────────

function CalendarGrid({
  year, month, selected, today, entries, habitHistory, onSelect,
}: {
  year:         number;
  month:        number;
  selected:     string;
  today:        string;
  entries:      Map<string, JournalEntry>;
  habitHistory: Map<string, string[]>;
  onSelect:     (d: string) => void;
}) {
  const cells = buildGrid(year, month);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {WDAY_LABELS.map(l => (
          <div key={l} style={{ textAlign: 'center', fontSize: 10, color: 'var(--faint)', fontFamily: 'var(--mono)', letterSpacing: '.04em', padding: '2px 0' }}>{l}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((key, i) => {
          if (!key) return <div key={i} />;
          const isSelected = key === selected;
          const isToday    = key === today;
          const isFuture   = key > today;
          const hasContent = !!(entries.get(key)?.content?.trim());
          const hasHabits  = (entries.get(key)?.habits?.length ?? 0) > 0 || (habitHistory.get(key)?.length ?? 0) > 0;
          return (
            <button key={key} onClick={() => onSelect(key)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              padding: '5px 2px', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: 12, fontWeight: isSelected || isToday ? 700 : 400,
              color: isFuture ? 'var(--faint)' : isSelected ? 'var(--n1)' : 'var(--n2)',
              background: isSelected ? 'var(--accent-soft)' : 'transparent',
              border: isToday ? `1px solid color-mix(in oklch, var(--accent), transparent 60%)` : isSelected ? `1px solid color-mix(in oklch, var(--accent), transparent 70%)` : '1px solid transparent',
              transition: 'background .12s',
            }}>
              {Number(key.slice(8))}
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: hasContent ? 'var(--accent)' : hasHabits ? 'var(--faint)' : 'transparent', opacity: isFuture ? 0 : 1 }} />
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 10, color: 'var(--faint)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />entry</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--faint)', display: 'inline-block' }} />habits only</span>
      </div>
    </div>
  );
}

// ── Habit tracker grid ────────────────────────────────────────────────────────

function HabitGrid({
  year, month, monthHabits, entries, today, onToggle,
}: {
  year:        number;
  month:       number;
  monthHabits: string[];
  entries:     Map<string, JournalEntry>;
  today:       string;
  onToggle:    (date: string, habit: string) => void;
}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days        = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const pad         = (n: number) => String(n).padStart(2, '0');
  const dateKey     = (d: number) => `${year}-${pad(month + 1)}-${pad(d)}`;

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ minWidth: 'max-content', paddingBottom: 4 }}>

        {/* Day-number header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `112px repeat(${daysInMonth}, 20px) 52px`,
          gap: 2, marginBottom: 5, paddingLeft: 2,
        }}>
          <div />
          {days.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 9, color: 'var(--faint)', fontFamily: 'var(--mono)', lineHeight: 1.2 }}>
              {d}
            </div>
          ))}
          <div style={{ textAlign: 'center', fontSize: 9, color: 'var(--faint)' }}>done</div>
        </div>

        {/* One row per habit */}
        {monthHabits.map(habit => {
          let doneCount = 0;
          return (
            <div key={habit} style={{
              display: 'grid',
              gridTemplateColumns: `112px repeat(${daysInMonth}, 20px) 52px`,
              gap: 2, marginBottom: 3, alignItems: 'center',
            }}>
              {/* Habit label */}
              <div style={{
                fontSize: 11.5, color: 'var(--n2)', paddingRight: 8,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={habit}>
                {habit}
              </div>

              {/* Day cells */}
              {days.map(d => {
                const dk     = dateKey(d);
                const done   = (entries.get(dk)?.habits ?? []).includes(habit);
                const future = dk > today;
                if (done) doneCount++;
                return (
                  <button
                    key={d}
                    disabled={future}
                    onClick={() => onToggle(dk, habit)}
                    title={`${MONTH_NAMES[month]} ${d}: ${habit}`}
                    style={{
                      width: 20, height: 20, borderRadius: 4, padding: 0, flexShrink: 0,
                      cursor: future ? 'default' : 'pointer',
                      background: done ? 'var(--accent)' : 'transparent',
                      border: done ? '1px solid transparent' : future ? '1px solid rgba(255,255,255,.05)' : '1px solid rgba(255,255,255,.18)',
                      transition: 'background .08s, border-color .08s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    onMouseEnter={e => { if (!done && !future) (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
                    onMouseLeave={e => { if (!done && !future) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.18)'; }}
                  />
                );
              })}

              {/* Total */}
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 11, textAlign: 'center',
                color: doneCount === 0 ? 'var(--faint)' : doneCount >= daysInMonth * 0.8 ? 'var(--ok)' : 'var(--n2)',
              }}>
                {doneCount}/{daysInMonth}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Habit edit panel ──────────────────────────────────────────────────────────

function EditHabitsPanel({
  draft, onChangeDraft, newInput, onChangeNew, onAdd, onSave, onCancel, saving,
}: {
  draft:          string[];
  onChangeDraft:  (h: string[]) => void;
  newInput:       string;
  onChangeNew:    (v: string) => void;
  onAdd:          () => void;
  onSave:         () => void;
  onCancel:       () => void;
  saving:         boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--faint)' }}>Edit the habits tracked this month:</div>

      {/* Existing habits */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {draft.map((name, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              flex: 1, fontSize: 13, padding: '4px 10px', borderRadius: 8,
              background: 'var(--ph)', border: '1px solid var(--card-bd)', color: 'var(--n1)',
            }}>{name}</div>
            <button
              onClick={() => onChangeDraft(draft.filter((_, j) => j !== i))}
              style={{ fontSize: 14, color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, lineHeight: 1 }}
              title="Remove habit"
            >✕</button>
          </div>
        ))}
      </div>

      {/* Add new */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="hs-input"
          placeholder="Add habit…"
          value={newInput}
          onChange={e => onChangeNew(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
          style={{ flex: 1, fontSize: 13 }}
        />
        <button className="btn ghost" onClick={onAdd} style={{ fontSize: 12, padding: '6px 12px' }}>+ Add</button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={onSave} disabled={saving} style={{ fontSize: 12, padding: '7px 14px' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn ghost" onClick={onCancel} style={{ fontSize: 12, padding: '7px 14px' }}>Cancel</button>
      </div>
    </div>
  );
}

// ── Month notes list ──────────────────────────────────────────────────────────

function MonthNotesList({
  monthKey, selected, entries, onSelect,
}: {
  monthKey: string;
  selected: string;
  entries:  Map<string, JournalEntry>;
  onSelect: (d: string) => void;
}) {
  const days = [...entries.entries()]
    .filter(([k, v]) => k.startsWith(monthKey) && (v.content.trim() || v.habits.length > 0))
    .sort(([a], [b]) => a.localeCompare(b));

  if (days.length === 0) return (
    <div style={{ fontSize: 12, color: 'var(--faint)', fontStyle: 'italic', padding: '6px 2px' }}>
      No entries for this month yet. Click a day above to add a note.
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {days.map(([date, entry]) => {
        const [, , d] = date.split('-').map(Number);
        const isSelected = date === selected;
        const preview = entry.content.trim().slice(0, 90);
        const habDone = entry.habits.length;
        return (
          <button
            key={date}
            onClick={() => onSelect(date)}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 10,
              padding: '8px 10px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
              background: isSelected ? 'var(--accent-soft)' : 'transparent',
              border: isSelected ? '1px solid color-mix(in oklch, var(--accent), transparent 80%)' : '1px solid transparent',
              transition: 'background .1s',
            }}
            onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--ph)'; }}
            onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)', flexShrink: 0, width: 24 }}>{d}</span>
            <span style={{ fontSize: 13, color: 'var(--n2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preview || <em style={{ color: 'var(--faint)', fontStyle: 'italic' }}>no note</em>}
            </span>
            {habDone > 0 && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)', flexShrink: 0 }}>{habDone}✓</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Month goals summary ───────────────────────────────────────────────────────

function GoalLine({ goal }: { goal: GoalWithProgress }) {
  const meta = CATEGORY_META[goal.category] ?? CATEGORY_META.other;
  const target = goal.target_value > 1
    ? `${goal.target_value}${goal.target_unit && goal.target_unit !== 'completion' ? ' ' + goal.target_unit : ''}`
    : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 2px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--n2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {goal.title}
      </span>
      {target && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)', flexShrink: 0 }}>{target}</span>}
    </div>
  );
}

function MonthGoalsPanel({ year, month, onManage }: { year: number; month: number; onManage: () => void }) {
  const { goals } = useGoals();

  const yearOf  = (g: GoalWithProgress) => g.start_date ? new Date(g.start_date + 'T12:00').getFullYear() : null;
  const monthOf = (g: GoalWithProgress) => g.start_date ? new Date(g.start_date + 'T12:00').getMonth() : null;

  // This page is monthly-focused: only the selected month's goals, never year/long-term goals.
  const monthGoals = goals.filter(g => g.timeframe === 'monthly' && yearOf(g) === year && monthOf(g) === month);

  return (
    <Panel
      glyph="◎"
      title={`Goals — ${MONTH_NAMES[month]} ${year}`}
      meta={
        <button className="btn ghost" onClick={onManage} style={{ fontSize: 11, padding: '2px 8px' }}>
          manage →
        </button>
      }
    >
      {monthGoals.length > 0 ? (
        monthGoals.map(g => <GoalLine key={g.id} goal={g} />)
      ) : (
        <div style={{ fontSize: 12, color: 'var(--faint)', fontStyle: 'italic', padding: '4px 2px' }}>
          No goals set for this month. <span onClick={onManage} style={{ color: 'var(--accent)', cursor: 'pointer' }}>Add some →</span>
        </div>
      )}
    </Panel>
  );
}

// ── Recent entries strip (current/near months) ─────────────────────────────────

function RecentStrip({
  today, selected, entries, habitHistory, onSelect,
}: {
  today:        string;
  selected:     string;
  entries:      Map<string, JournalEntry>;
  habitHistory: Map<string, string[]>;
  onSelect:     (d: string) => void;
}) {
  const days: string[] = [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 14; i++) {
    const d = new Date(base.getTime() - i * 86_400_000);
    days.push(dateToKey(d));
  }
  const withContent = days.filter(d => entries.get(d)?.content?.trim() || (habitHistory.get(d)?.length ?? 0) > 0);
  if (withContent.length === 0) return null;

  return (
    <div className="card" style={{ gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Recent entries</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {withContent.map(d => {
          const entry      = entries.get(d);
          const habDone    = habitHistory.get(d) ?? [];
          const isSelected = d === selected;
          const preview    = entry?.content?.trim().slice(0, 80) || null;
          return (
            <button
              key={d}
              onClick={() => onSelect(d)}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 10,
                padding: '8px 10px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                background: isSelected ? 'var(--accent-soft)' : 'transparent',
                border: isSelected ? '1px solid color-mix(in oklch, var(--accent), transparent 80%)' : '1px solid transparent',
                transition: 'background .1s',
              }}
              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--ph)'; }}
              onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)', flexShrink: 0, width: 56 }}>{d.slice(5).replace('-', '/')}</span>
              <span style={{ fontSize: 13, color: 'var(--n2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preview ?? <em style={{ color: 'var(--faint)', fontStyle: 'italic' }}>habits only · {habDone.length}✓</em>}
              </span>
              {habDone.length > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)', flexShrink: 0 }}>{habDone.length}✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// ── Writing momentum (words/day, streaks, volume) ─────────────────────────────

function MomentumCard({ days, today, yearEntries, totalEntries }: {
  days: StatDay[];
  today: string;
  yearEntries: number;
  totalEntries: number;
}) {
  const [range, setRange] = useState<28 | 84>(28);
  const byDate = new Map(days.map(d => [d.date, d]));

  const data = lastNDays(range).map(k => {
    const dd = new Date(k + 'T12:00:00');
    return { d: k, label: `${dd.getMonth() + 1}/${dd.getDate()}`, words: byDate.get(k)?.words ?? 0 };
  }).map((row, i, arr) => {
    const win = arr.slice(Math.max(0, i - 6), i + 1);
    return { ...row, avg7: Math.round(win.reduce((s, r) => s + r.words, 0) / win.length) };
  });

  // Streaks over the full fetched window (120d), not just the visible range
  const wrote = new Set(days.filter(d => d.words > 0).map(d => d.date));
  const window120 = lastNDays(120);
  let streak = 0;
  for (let i = window120.length - 1; i >= 0; i--) {
    const k = window120[i];
    if (wrote.has(k)) streak++;
    else if (k === today) continue;   // today still in progress — don't break the streak
    else break;
  }
  let best = 0, run = 0;
  for (const k of window120) {
    if (wrote.has(k)) { run++; if (run > best) best = run; }
    else run = 0;
  }

  const written  = data.filter(r => r.words > 0);
  const avgWords = written.length > 0
    ? Math.round(written.reduce((s, r) => s + r.words, 0) / written.length) : 0;

  return (
    <Panel
      glyph="↗"
      title="Momentum"
      meta={
        <span onClick={e => e.stopPropagation()}>
          <Seg
            options={[{ id: 28, label: '4W' }, { id: 84, label: '12W' }]}
            value={range} onChange={setRange}
          />
        </span>
      }
    >
      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -14 }} barCategoryGap="14%">
          <CartesianGrid stroke="var(--n4)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
            tickLine={false} axisLine={false} interval={range === 28 ? 3 : 13} />
          <YAxis tick={{ fontSize: 9.5, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
            tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM}
            formatter={(v, name) => [`${v} words`, name === 'avg7' ? '7-day avg' : 'written']}
            labelFormatter={(label, payload) =>
              (payload?.[0]?.payload as typeof data[number] | undefined)?.d ?? String(label)}
          />
          <Bar dataKey="words" radius={[3, 3, 0, 0]} name="words">
            {data.map(r => (
              <Cell key={r.d} fill={r.words > 0 ? 'var(--accent2)' : 'rgba(255,255,255,.06)'} />
            ))}
          </Bar>
          {range === 84 && (
            <Line type="monotone" dataKey="avg7" stroke="var(--viz)" strokeWidth={2} dot={false} name="avg7" />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="hx-tiles" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Tile label="streak" value={String(streak)} unit="d"
          color={streak > 0 ? PAL.ok : undefined} sub={`best ${best}d`} />
        <Tile label="avg entry" value={String(avgWords)} unit="words" color="var(--accent2)" />
        <Tile label="this year" value={String(yearEntries)} unit="entries" />
        <Tile label="all time" value={String(totalEntries)} unit="entries" color="var(--accent)" />
      </div>
    </Panel>
  );
}

// ── Mood trend ────────────────────────────────────────────────────────────────

function MoodCard({ days }: { days: StatDay[] }) {
  const byDate = new Map(days.map(d => [d.date, d]));
  const data = lastNDays(30).map(k => {
    const dd = new Date(k + 'T12:00:00');
    return { d: k, label: `${dd.getMonth() + 1}/${dd.getDate()}`, mood: byDate.get(k)?.mood ?? null };
  });
  const rated = data.filter((r): r is typeof r & { mood: number } => r.mood != null);

  if (rated.length === 0) {
    return (
      <Panel glyph="◉" title="Mood">
        <div style={{ fontSize: 12, color: 'var(--faint)', lineHeight: 1.6, padding: '6px 0' }}>
          Rate your day under the entry box — a 30-day mood trend builds here.
        </div>
      </Panel>
    );
  }

  const avg = rated.reduce((s, r) => s + r.mood, 0) / rated.length;
  const dist = MOOD_META.map(m => ({ ...m, n: rated.filter(r => r.mood === m.v).length }));
  const maxN = Math.max(...dist.map(d => d.n), 1);

  return (
    <Panel glyph="◉" title="Mood" meta={<span className="pill">30 days</span>}>
      <ResponsiveContainer width="100%" height={110}>
        <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -28 }}>
          <CartesianGrid stroke="var(--n4)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
            tickLine={false} axisLine={false} interval={6} />
          <YAxis domain={[1, 5]} ticks={[1, 3, 5]} tick={{ fontSize: 9, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
            tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM}
            formatter={(v) => [moodLabel(Number(v)), 'mood']}
            labelFormatter={(label, payload) =>
              (payload?.[0]?.payload as typeof data[number] | undefined)?.d ?? String(label)}
          />
          <ReferenceLine y={avg} stroke="rgba(255,255,255,.16)" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="mood" stroke="var(--accent)" strokeWidth={2}
            connectNulls dot={{ r: 2.5, fill: 'var(--bg2)', stroke: 'var(--accent)', strokeWidth: 1.4 }} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Distribution + average */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 2 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', flex: 1, height: 34 }}>
          {dist.map(m => (
            <div key={m.v} title={`${m.label} · ${m.n}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{
                width: '100%', borderRadius: 3,
                height: Math.max(3, Math.round((m.n / maxN) * 24)),
                background: m.n > 0 ? m.color : 'rgba(255,255,255,.06)',
              }} />
              <span style={{ fontSize: 8.5, fontFamily: 'var(--mono)', color: 'var(--faint)' }}>{m.v}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: moodColor(Math.round(avg)), lineHeight: 1 }}>
            {avg.toFixed(1)}
          </div>
          <div style={{ fontSize: 9.5, color: 'var(--faint)', marginTop: 2 }}>avg · {rated.length} rated</div>
        </div>
      </div>
    </Panel>
  );
}

// ── Card layout (drag-and-drop, mirrors HealthDeep/DashboardView) ─────────────

type NotesCard   = 'entry' | 'momentum' | 'tracker' | 'goals' | 'list' | 'calendar' | 'mood';
type NotesLayout = { main: NotesCard[]; side: NotesCard[] };

const NOTES_DEFAULT: NotesLayout = {
  main: ['entry', 'momentum', 'tracker', 'goals', 'list'],
  side: ['calendar', 'mood'],
};

const NOTES_META: Record<NotesCard, { title: string; glyph: string }> = {
  entry:    { title: 'Daily Entry', glyph: '✎' },
  momentum: { title: 'Momentum',    glyph: '↗' },
  tracker:  { title: 'Tracker',     glyph: '◐' },
  goals:    { title: 'Month Goals', glyph: '◎' },
  list:     { title: 'Notes',       glyph: '≡' },
  calendar: { title: 'Calendar',    glyph: '◈' },
  mood:     { title: 'Mood',        glyph: '◉' },
};

const LS_NOTES_LAYOUT = 'notes-layout-v1';

function loadNotesLayout(): NotesLayout {
  if (typeof window === 'undefined') return NOTES_DEFAULT;
  try {
    const s = localStorage.getItem(LS_NOTES_LAYOUT);
    if (!s) return NOTES_DEFAULT;
    const parsed = JSON.parse(s) as NotesLayout;
    const known = new Set<NotesCard>([...NOTES_DEFAULT.main, ...NOTES_DEFAULT.side]);
    const main = (parsed.main ?? []).filter(id => known.has(id));
    const side = (parsed.side ?? []).filter(id => known.has(id));
    // Cards added after the layout was saved land in their default column
    const present = new Set([...main, ...side]);
    for (const id of NOTES_DEFAULT.main) if (!present.has(id)) main.push(id);
    for (const id of NOTES_DEFAULT.side) if (!present.has(id)) side.push(id);
    return { main, side };
  } catch { return NOTES_DEFAULT; }
}

// Columns are droppable themselves so a card can be dragged into an empty one
function DroppableCol({ id, className, children }: {
  id: string; className: string; children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id });
  return <div ref={setNodeRef} className={className} style={{ minHeight: 80 }}>{children}</div>;
}

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

export function NotesDeep() {
  const { setTab }                                              = useDashboard();
  const { isDemo, notifyWrite }                                 = useDemo();
  const isDemoRef = useRef(false); isDemoRef.current = isDemo;
  const { habits, history: habitHistory, toggle, setDateDone } = useHabits();

  const today   = localDateKey();
  const nowDate = new Date();

  // ── View state ────────────────────────────────────────────────────────────────
  const [viewYear,    setViewYear]    = useState(nowDate.getFullYear());
  const [viewMonth,   setViewMonth]   = useState(nowDate.getMonth());
  const [selectedKey, setSelectedKey] = useState(today);

  // ── Journal data ──────────────────────────────────────────────────────────────
  const [entries,      setEntries]      = useState<Map<string, JournalEntry>>(new Map());
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [draft,        setDraft]        = useState('');
  const [saveState,    setSaveState]    = useState<'idle' | 'saving' | 'saved'>('idle');
  const [stats,        setStats]        = useState<{
    days: StatDay[]; year: { entries: number }; total: { entries: number };
  } | null>(null);

  // ── Month-specific habit config ───────────────────────────────────────────────
  const [monthHabits,    setMonthHabits]    = useState<string[]>([]);
  const [editingHabits,  setEditingHabits]  = useState(false);
  const [habitEditDraft, setHabitEditDraft] = useState<string[]>([]);
  const [newHabitInput,  setNewHabitInput]  = useState('');
  const [savingHabits,   setSavingHabits]   = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Load month entries + habit config ─────────────────────────────────────────
  useEffect(() => {
    if (isDemo) { setEntries(buildDemoJournal()); setLoadingMonth(false); return; }
    const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    setLoadingMonth(true);
    setEditingHabits(false);

    Promise.all([
      fetch(`/api/journal?month=${month}`).then(r => r.json()),
      fetch(`/api/habit-configs?month=${month}`).then(r => r.json()),
    ])
      .then(([journalData, configData]: [
        { entries: { date: string; content: string; habits: string[]; mood?: number | null }[] },
        { habits: string[] },
      ]) => {
        setEntries(prev => {
          const next = new Map(prev);
          for (const e of journalData.entries) next.set(e.date, { content: e.content, habits: e.habits, mood: e.mood ?? null });
          return next;
        });
        setMonthHabits(configData.habits ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingMonth(false));
  }, [viewYear, viewMonth, isDemo]);

  // ── Writing analytics (120-day window + lifetime counts) ─────────────────────
  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;
    fetch('/api/journal/stats')
      .then(r => r.json())
      .then((s: { days?: StatDay[]; year?: { entries: number }; total?: { entries: number } }) => {
        if (!cancelled && Array.isArray(s.days)) {
          setStats({ days: s.days, year: s.year ?? { entries: 0 }, total: s.total ?? { entries: 0 } });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isDemo]);

  // Overlay live edits (this session) onto the fetched stats window
  const statDays = useMemo<StatDay[]>(() => {
    const m = new Map<string, StatDay>((stats?.days ?? []).map(d => [d.date, d]));
    for (const [date, e] of entries) {
      const words = countWords(e.content);
      const prev  = m.get(date);
      if (words > 0 || e.mood != null || prev) {
        m.set(date, { date, words, mood: e.mood ?? prev?.mood ?? null });
      }
    }
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [stats, entries]);

  // ── Sync textarea draft when selected date changes ────────────────────────────
  useEffect(() => {
    setDraft(entries.get(selectedKey)?.content ?? '');
    setSaveState('idle');
    clearTimeout(saveTimer.current);
  }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-resize textarea ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 100)}px`;
  }, [draft]);

  // ── Save journal content (debounced) ──────────────────────────────────────────
  const scheduleSave = useCallback((text: string, dateKey: string) => {
    clearTimeout(saveTimer.current);
    setSaveState('saving');
    if (isDemoRef.current) {
      notifyWrite();
      setEntries(prev => { const next = new Map(prev); const ex = next.get(dateKey) ?? { content: '', habits: [] }; next.set(dateKey, { ...ex, content: text }); return next; });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);
      return;
    }
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/journal/${dateKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text }) });
        setEntries(prev => { const next = new Map(prev); const ex = next.get(dateKey) ?? { content: '', habits: [] }; next.set(dateKey, { ...ex, content: text }); return next; });
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2500);
      } catch { setSaveState('idle'); }
    }, 900);
  }, [notifyWrite]);

  // ── Save mood (immediate, separate from the debounced text save) ─────────────
  const saveMood = useCallback((mood: number | null) => {
    setEntries(prev => {
      const next = new Map(prev);
      const ex = next.get(selectedKey) ?? { content: '', habits: [] };
      next.set(selectedKey, { ...ex, mood });
      return next;
    });
    if (isDemoRef.current) { notifyWrite(); return; }
    fetch(`/api/journal/${selectedKey}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mood }),
    }).catch(() => {});
  }, [selectedKey, notifyWrite]);

  // ── Toggle habit on historical grid ──────────────────────────────────────────
  const toggleHistoricalHabit = useCallback(async (date: string, habitName: string) => {
    const current = entries.get(date)?.habits ?? [];
    const next    = current.includes(habitName)
      ? current.filter(h => h !== habitName)
      : [...current, habitName];
    setEntries(prev => {
      const m = new Map(prev); const ex = m.get(date) ?? { content: '', habits: [] };
      m.set(date, { ...ex, habits: next }); return m;
    });
    await fetch(`/api/habits/${date}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done: next }),
    });
  }, [entries]);

  // ── Save edited habit config ──────────────────────────────────────────────────
  const saveHabitConfig = useCallback(async () => {
    setSavingHabits(true);
    const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    try {
      await fetch(`/api/habit-configs?month=${month}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ habits: habitEditDraft }),
      });
      setMonthHabits(habitEditDraft);
      setEditingHabits(false);
    } finally { setSavingHabits(false); }
  }, [habitEditDraft, viewYear, viewMonth]);

  // ── Month navigation ──────────────────────────────────────────────────────────
  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    const isCur = viewYear === nowDate.getFullYear() && viewMonth === nowDate.getMonth();
    if (isCur) return;
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const isCurrentMonth = viewYear === nowDate.getFullYear() && viewMonth === nowDate.getMonth();

  // ── Derived ───────────────────────────────────────────────────────────────────
  const isToday       = selectedKey === today;
  const dayHabitsDone = habitHistory.get(selectedKey) ?? [];
  const doneCount     = dayHabitsDone.length;
  const totalHabits   = habits.length;
  const monthKey      = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const monthEntries  = [...entries.entries()].filter(([k, v]) => k.startsWith(monthKey) && (v.content.trim() || v.habits.length > 0)).length;

  // ── Current-month habit toggle ────────────────────────────────────────────────
  const toggleHabit = useCallback((id: string) => {
    if (isToday) { toggle(id); } else {
      const current = habitHistory.get(selectedKey) ?? [];
      const next    = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
      setDateDone(selectedKey, next);
    }
  }, [isToday, toggle, habitHistory, selectedKey, setDateDone]);

  // ── Card drag-and-drop state ──────────────────────────────────────────────
  const [layout,     setLayout]     = useState<NotesLayout>(NOTES_DEFAULT);
  const [activeCard, setActiveCard] = useState<NotesCard | null>(null);

  useEffect(() => { setLayout(loadNotesLayout()); }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const saveLayout = (l: NotesLayout) => {
    setLayout(l);
    localStorage.setItem(LS_NOTES_LAYOUT, JSON.stringify(l));
  };

  const findCol = (id: NotesCard): keyof NotesLayout | null => {
    for (const col of ['main', 'side'] as const) {
      if (layout[col].includes(id)) return col;
    }
    return null;
  };

  const onDragStart = ({ active }: DragStartEvent) => setActiveCard(active.id as NotesCard);

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || active.id === over.id) return;
    const overId = over.id as string;
    const ac = findCol(active.id as NotesCard);
    const oc = (overId === 'main' || overId === 'side') ? overId : findCol(overId as NotesCard);
    if (!ac || !oc || ac === oc) return;

    setLayout(prev => {
      const item      = active.id as NotesCard;
      const destItems = [...prev[oc]];
      const overIdx   = destItems.indexOf(over.id as NotesCard);
      const newDest   = overIdx >= 0
        ? [...destItems.slice(0, overIdx), item, ...destItems.slice(overIdx)]
        : [...destItems, item];
      return { ...prev, [ac]: prev[ac].filter(i => i !== item), [oc]: newDest };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveCard(null);
    if (!over || active.id === over.id) { saveLayout(layout); return; }
    const ac = findCol(active.id as NotesCard);
    const oc = findCol(over.id as NotesCard);
    if (!ac) { saveLayout(layout); return; }
    if (ac === oc) {
      const items  = layout[ac];
      const oldIdx = items.indexOf(active.id as NotesCard);
      const newIdx = items.indexOf(over.id as NotesCard);
      if (oldIdx !== newIdx) { saveLayout({ ...layout, [ac]: arrayMove(items, oldIdx, newIdx) }); return; }
    }
    saveLayout(layout);
  };

  function renderCard(id: NotesCard) {
    switch (id) {
      case 'entry': return (
        <Panel
          glyph="✎"
          title={fmtHeading(selectedKey)}
          meta={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {draft.trim() !== '' && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>
                  {countWords(draft)}w
                </span>
              )}
              {isToday && <span className="pill">today</span>}
              {saveState === 'saving' && <span style={{ fontSize: 11, color: 'var(--faint)' }}>saving…</span>}
              {saveState === 'saved'  && <span style={{ fontSize: 11, color: 'var(--ok)'   }}>✓ saved</span>}
            </div>
          }
        >
          <textarea
            ref={textareaRef}
            value={draft}
            placeholder={isToday ? 'What happened today? A sentence or two is enough…' : 'No entry for this day. Click to add one…'}
            onChange={e => { setDraft(e.target.value); scheduleSave(e.target.value, selectedKey); }}
            style={{
              width: '100%', resize: 'none', minHeight: 80,
              background: 'var(--ph)', border: '1px solid var(--ph-bd)',
              borderRadius: 10, padding: '12px 14px',
              fontFamily: 'var(--sans)', fontSize: 14, lineHeight: 1.6,
              color: 'var(--n1)', outline: 'none', transition: 'border-color .15s', boxSizing: 'border-box',
            }}
            onFocus={e => (e.target.style.borderColor = 'color-mix(in oklch, var(--accent), transparent 60%)')}
            onBlur={e  => (e.target.style.borderColor = 'var(--ph-bd)')}
          />
          <MoodPicker value={entries.get(selectedKey)?.mood ?? null} onSelect={saveMood} />
        </Panel>
      );

      case 'momentum': return (
        <MomentumCard
          days={statDays} today={today}
          yearEntries={stats?.year.entries ?? statDays.filter(d => d.words > 0).length}
          totalEntries={stats?.total.entries ?? statDays.filter(d => d.words > 0).length}
        />
      );

      case 'tracker': return (
        <Panel
          glyph="◐"
          title={monthHabits.length > 0 ? `${MONTH_NAMES[viewMonth]} ${viewYear} Tracker` : 'Habits'}
          meta={
            monthHabits.length > 0 ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mut)' }}>{monthHabits.length} habits</span>
                {!editingHabits && (
                  <button
                    className="btn ghost"
                    onClick={() => { setHabitEditDraft([...monthHabits]); setNewHabitInput(''); setEditingHabits(true); }}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                  >
                    edit
                  </button>
                )}
              </div>
            ) : (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: doneCount === totalHabits && totalHabits > 0 ? 'var(--ok)' : 'var(--mut)' }}>
                {doneCount}/{totalHabits}
              </span>
            )
          }
        >
          {monthHabits.length > 0 ? (
            editingHabits ? (
              <EditHabitsPanel
                draft={habitEditDraft}
                onChangeDraft={setHabitEditDraft}
                newInput={newHabitInput}
                onChangeNew={setNewHabitInput}
                onAdd={() => {
                  const trimmed = newHabitInput.trim();
                  if (trimmed && !habitEditDraft.includes(trimmed)) {
                    setHabitEditDraft(d => [...d, trimmed]);
                  }
                  setNewHabitInput('');
                }}
                onSave={saveHabitConfig}
                onCancel={() => setEditingHabits(false)}
                saving={savingHabits}
              />
            ) : (
              <HabitGrid
                year={viewYear} month={viewMonth}
                monthHabits={monthHabits} entries={entries}
                today={today} onToggle={toggleHistoricalHabit}
              />
            )
          ) : habits.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--faint)' }}>No habits configured. Set them up in the Habits section.</div>
          ) : (
            // Same two-column flow as the Habits tab's Today card
            <div style={{
              display: 'grid',
              gridAutoFlow: 'column',
              gridTemplateRows: `repeat(${Math.ceil(habits.length / 2)}, auto)`,
              gap: 6,
            }}>
              {habits.map(h => {
                const done   = dayHabitsDone.includes(h.id);
                const streak = calcStreak(h.id, today, habitHistory.get(today) ?? [], habitHistory);
                return <HabitRingBtn key={h.id} habit={h} done={done} streak={streak} onToggle={() => toggleHabit(h.id)} />;
              })}
            </div>
          )}
        </Panel>
      );

      case 'goals': return (
        <MonthGoalsPanel year={viewYear} month={viewMonth} onManage={() => setTab('goals')} />
      );

      case 'list': return monthHabits.length > 0 ? (
        <Panel glyph="≡" title={`Notes — ${MONTH_NAMES[viewMonth]} ${viewYear}`}>
          <MonthNotesList
            monthKey={monthKey}
            selected={selectedKey}
            entries={entries}
            onSelect={d => { setSelectedKey(d); }}
          />
        </Panel>
      ) : (
        <RecentStrip
          today={today} selected={selectedKey}
          entries={entries} habitHistory={habitHistory}
          onSelect={d => { setSelectedKey(d); const [y, m] = d.split('-').map(Number); setViewYear(y); setViewMonth(m - 1); }}
        />
      );

      case 'calendar': return (
        <Panel
          glyph="◈"
          title={`${MONTH_NAMES[viewMonth]} ${viewYear}`}
          meta={
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={prevMonth} className="btn ghost" style={{ padding: '3px 8px', fontSize: 15 }}>‹</button>
              <button onClick={nextMonth} className="btn ghost" disabled={isCurrentMonth} style={{ padding: '3px 8px', fontSize: 15, opacity: isCurrentMonth ? .3 : 1 }}>›</button>
            </div>
          }
        >
          {loadingMonth ? (
            <div style={{ color: 'var(--faint)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>Loading…</div>
          ) : (
            <CalendarGrid
              year={viewYear} month={viewMonth}
              selected={selectedKey} today={today}
              entries={entries} habitHistory={habitHistory}
              onSelect={setSelectedKey}
            />
          )}
        </Panel>
      );

      case 'mood': return <MoodCard days={statDays} />;
    }
  }

  return (
    <div className="canvas">
      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>

      <div className="deep-head">
        <div>
          <h1>Daily Log</h1>
          <div className="sub">
            PERSONAL JOURNAL
            {monthEntries > 0 && ` · ${monthEntries} ENTR${monthEntries === 1 ? 'Y' : 'IES'} THIS MONTH`}
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="notes-layout">
          {(['main', 'side'] as const).map(col => (
            <DroppableCol key={col} id={col} className={col === 'main' ? 'notes-main' : 'notes-side'}>
              <SortableContext items={layout[col]} strategy={verticalListSortingStrategy}>
                {layout[col].map(id => (
                  <SortableCard key={id} id={id}>
                    {renderCard(id)}
                  </SortableCard>
                ))}
              </SortableContext>
            </DroppableCol>
          ))}
        </div>

        <DragOverlay
          dropAnimation={{ duration: 200, easing: 'cubic-bezier(.22,.61,.36,1)' }}
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
                <div className="glyph">{NOTES_META[activeCard].glyph}</div>
                <div className="ctitle">{NOTES_META[activeCard].title}</div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
