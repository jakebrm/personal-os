'use client';
import { useState, useEffect } from 'react';
import { Panel } from '../Panel';
import { useDashboard } from '../context';
import { useGoals }     from '../GoalsContext';
import { useHabits }    from '../HabitsContext';
import {
  CATEGORY_META, PRESET_COLORS, GOAL_TEMPLATES,
  type Goal, type GoalWithProgress, type GoalTemplate,
  type GoalCategory, type GoalTimeframe, type GoalMetricSource, type GoalPaceStatus,
} from '@/lib/goals';
import { homeDateStr } from '@/lib/dates';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PACE_LABEL: Record<GoalPaceStatus, string> = {
  on_track:  'On Track',
  at_risk:   'At Risk',
  behind:    'Behind',
  completed: 'Done!',
};
const PACE_COLOR: Record<GoalPaceStatus, string> = {
  on_track:  'var(--ok)',
  at_risk:   'var(--warn)',
  behind:    'var(--danger)',
  completed: 'var(--accent)',
};

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function fmt(v: number, unit: string | null): string {
  if (!unit) return String(Math.round(v * 10) / 10);
  const decimalUnits = new Set(['km', 'mi', 'miles']);
  const rounded = decimalUnits.has(unit) ? (Math.round(v * 10) / 10).toFixed(1) : Math.round(v);
  return `${rounded} ${unit}`;
}

// ── Mini progress ring ────────────────────────────────────────────────────────

function GoalRing({ pct, color, size = 64 }: { pct: number; color: string; size?: number }) {
  const R   = (size - 10) / 2;
  const C   = parseFloat((2 * Math.PI * R).toFixed(2));
  const off = C * (1 - Math.min(100, pct) / 100);
  return (
    <svg width={size} height={size} style={{ flexShrink: 0, display: 'block', transform: 'rotate(-90deg)' }}>
      <circle r={R} cx={size/2} cy={size/2} fill="none" stroke="var(--n4)" strokeWidth={5} />
      <circle r={R} cx={size/2} cy={size/2} fill="none" stroke={color} strokeWidth={5}
        strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off}
        style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.22,.61,.36,1)' }}
      />
    </svg>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ history, target, color }: {
  history: { date: string; cumulative: number }[];
  target:  number;
  color:   string;
}) {
  if (history.length < 2) return null;
  const W = 80, H = 24;
  const vals = history.map(h => h.cumulative);
  const max  = Math.max(target, ...vals, 1);
  const pts  = vals.map((v, i) =>
    `${(i / (vals.length - 1)) * (W - 4) + 2},${H - 2 - ((v / max) * (H - 4))}`
  ).join(' ');
  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
    </svg>
  );
}

// ── Goal card ─────────────────────────────────────────────────────────────────

function GoalCard({ goal, onClick, onToggleDone }: {
  goal: GoalWithProgress;
  onClick: () => void;
  onToggleDone?: (g: GoalWithProgress) => void;
}) {
  const ringColor  = PACE_COLOR[goal.pace_status];
  const catMeta    = CATEGORY_META[goal.category] ?? CATEGORY_META.other;
  const catColor   = catMeta.color;
  const pctDisplay = Math.min(100, goal.pct);

  // "1 and done" goals — a single checkbox instead of a progress ring
  const isBinary    = onToggleDone && goal.metric_source === 'manual' && goal.target_value === 1;
  const realDone    = goal.current_value >= goal.target_value;
  // Optimistic flip so the checkbox responds instantly before the refetch lands
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => { setOptimistic(null); }, [goal.current_value]);
  const completed = optimistic ?? realDone;

  if (isBinary) {
    return (
      <div
        onClick={onClick}
        className="card"
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          padding: '14px 16px 14px 18px', cursor: 'pointer',
          '--card-accent': catColor,
        } as React.CSSProperties}
      >
        {/* Checkbox */}
        <button
          aria-pressed={completed}
          title={completed ? 'Mark not done' : 'Mark done'}
          onClick={e => { e.stopPropagation(); setOptimistic(!completed); onToggleDone!(goal); }}
          style={{
            flexShrink: 0, width: 26, height: 26, borderRadius: 8, cursor: 'pointer',
            display: 'grid', placeItems: 'center', padding: 0,
            background: completed ? catColor : 'transparent',
            border: completed ? '1px solid transparent' : '2px solid var(--glyph-bd)',
            color: '#fff', fontSize: 15, fontWeight: 800, lineHeight: 1,
            transition: 'background .12s, border-color .12s',
          }}
        >
          {completed ? '✓' : ''}
        </button>

        {/* Icon + title */}
        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, color: catColor, opacity: completed ? .5 : 1 }}>{goal.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: 13.5, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: completed ? 'var(--faint)' : 'var(--n1)',
            textDecoration: completed ? 'line-through' : 'none',
          }}>
            {goal.title}
          </div>
          <span style={{
            display: 'inline-block', marginTop: 4,
            fontSize: 10, fontWeight: 600, letterSpacing: '.05em', color: catColor,
            borderRadius: 20, padding: '1px 7px',
            background: 'var(--chip-bg)', border: '1px solid var(--card-bd)',
          }}>
            {catMeta.glyph} {catMeta.label}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="card"
      // data-deeptab is only here for the CSS hover-lift; navigation is our onClick
      data-deeptab="goal"
      style={{ padding: '16px 18px', gap: 0, cursor: 'pointer', '--card-accent': catColor } as React.CSSProperties}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14, paddingLeft: 8 }}>
        <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, color: catColor }}>{goal.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {goal.title}
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '.05em',
              color: catColor,
              borderRadius: 20, padding: '1px 7px',
              background: 'var(--chip-bg)',
              border: '1px solid var(--card-bd)',
            }}>
              {catMeta.glyph} {catMeta.label}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: ringColor, background: ringColor + '20',
              border: '1px solid ' + ringColor + '40',
              borderRadius: 20, padding: '1px 7px',
            }}>
              {PACE_LABEL[goal.pace_status]}
            </span>
          </div>
        </div>
      </div>

      {/* Progress row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 8 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <GoalRing pct={pctDisplay} color={ringColor} size={64} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{pctDisplay}%</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: ringColor, lineHeight: 1 }}>
            {fmt(goal.current_value, goal.target_unit)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 2 }}>
            of {fmt(goal.target_value, goal.target_unit)}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 5, fontFamily: 'var(--mono)' }}>
            {goal.days_remaining}d left
          </div>
        </div>
        <div style={{ alignSelf: 'flex-end', paddingBottom: 4 }}>
          <Sparkline history={goal.progress_history} target={goal.target_value} color={ringColor} />
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 12, paddingLeft: 8 }}>
        <div style={{ height: 4, borderRadius: 4, background: 'var(--ph)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pctDisplay}%`, borderRadius: 4,
            background: ringColor,
            transition: 'width .6s cubic-bezier(.22,.61,.36,1)',
          }} />
        </div>
      </div>
    </div>
  );
}

// ── Goal detail drawer ────────────────────────────────────────────────────────

function GoalDetailDrawer({ goal, habits, onClose, onUpdate, onLogProgress }: {
  goal:          GoalWithProgress;
  habits:        { id: string; label: string }[];
  onClose:       () => void;
  onUpdate:      (id: string, patch: Partial<Goal>) => Promise<void>;
  onLogProgress: (id: string, value: number, date?: string, note?: string) => Promise<void>;
}) {
  const ringColor = PACE_COLOR[goal.pace_status];
  const catMeta   = CATEGORY_META[goal.category] ?? CATEGORY_META.other;
  const [logVal,  setLogVal]  = useState('');
  const [logNote, setLogNote] = useState('');
  const [logDate, setLogDate] = useState(homeDateStr());
  const [logging, setLogging] = useState(false);
  const [saving,  setSaving]  = useState(false);

  const [editing,    setEditing]    = useState(false);
  const [editIcon,   setEditIcon]   = useState(goal.icon);
  const [editTitle,  setEditTitle]  = useState(goal.title);
  const [editTarget, setEditTarget] = useState(String(goal.target_value));
  const [editUnit,   setEditUnit]   = useState(goal.target_unit ?? '');
  const [editColor,  setEditColor]  = useState(goal.color);
  const [editTf,     setEditTf]     = useState<GoalTimeframe>(goal.timeframe);
  const [editSource, setEditSource] = useState<GoalMetricSource>(goal.metric_source);
  const [editField,  setEditField]  = useState(goal.metric_field ?? '');
  const [editErr,    setEditErr]    = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const openEdit = () => {
    setEditIcon(goal.icon); setEditTitle(goal.title);
    setEditTarget(String(goal.target_value)); setEditUnit(goal.target_unit ?? '');
    setEditColor(goal.color); setEditTf(goal.timeframe);
    setEditSource(goal.metric_source); setEditField(goal.metric_field ?? '');
    setEditErr(''); setEditing(true);
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    setEditSaving(true); setEditErr('');
    try {
      const patch: Partial<Goal> = {
        icon: editIcon || goal.icon, title: editTitle.trim(),
        target_value: parseFloat(editTarget) || goal.target_value,
        target_unit: editUnit || null, color: editColor, timeframe: editTf,
        metric_source: editSource,
      };
      if (editSource === 'habits') patch.metric_field = editField || null;
      else if (editSource === 'manual') patch.metric_field = null;
      await onUpdate(goal.id, patch);
      setEditing(false);
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  const submitLog = async () => {
    const v = parseFloat(logVal);
    if (isNaN(v)) return;
    setLogging(true);
    await onLogProgress(goal.id, v, logDate, logNote || undefined);
    setLogVal(''); setLogNote('');
    setLogging(false);
  };

  // Soft-archive only — the goal keeps its history; the API stops returning it.
  const abandon = async () => {
    if (!confirm(`Abandon "${goal.title}"?`)) return;
    setSaving(true);
    await onUpdate(goal.id, { status: 'abandoned' });
    onClose();
  };

  const milestones = [25, 50, 75, 100].map(m => {
    const needed  = (goal.target_value * m) / 100;
    const reached = goal.current_value >= needed;
    const point   = goal.progress_history.find(h => h.cumulative >= needed);
    return { pct: m, reached, date: point?.date ?? null };
  });

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 101,
        width: 'min(340px, 100vw)', overflowY: 'auto',
        background: 'var(--bg2)', border: '1px solid var(--card-bd)',
        borderRight: 'none', borderTop: 'none', borderBottom: 'none',
        boxShadow: '-20px 0 60px rgba(0,0,0,.7)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ height: 4, background: catMeta.color, flexShrink: 0 }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px 14px', borderBottom: '1px solid var(--card-bd)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24, color: catMeta.color }}>{goal.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>{goal.title}</div>
              <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 2 }}>
                {catMeta.label} · {goal.timeframe}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="hs-btn" style={{ width: 28, height: 28, fontSize: 12 }}
              onClick={editing ? () => setEditing(false) : openEdit}
              title={editing ? 'Cancel edit' : 'Edit goal'}>{editing ? '✕' : '✎'}</button>
            <button className="hs-btn" style={{ width: 28, height: 28, fontSize: 14 }} onClick={onClose}>✕</button>
          </div>
        </div>

        {editing && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--card-bd)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="hs-input" value={editIcon} onChange={e => setEditIcon(e.target.value)}
                style={{ width: 46, textAlign: 'center', fontSize: 18, padding: '5px 6px' }} />
              <input className="hs-input" placeholder="Title" value={editTitle}
                onChange={e => setEditTitle(e.target.value)} style={{ flex: 1 }} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--faint)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>Target</div>
                <input className="hs-input" type="number" min={0} value={editTarget}
                  onChange={e => setEditTarget(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--faint)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>Unit</div>
                <input className="hs-input" placeholder="books, days, km…" value={editUnit}
                  onChange={e => setEditUnit(e.target.value)} style={{ width: '100%' }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--faint)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>Timeframe</div>
              <div className="chips">
                {(['daily','weekly','monthly','yearly'] as GoalTimeframe[]).map(t => (
                  <span key={t} className={`chip${editTf === t ? ' acc' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setEditTf(t)}>{t}</span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--faint)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>Color</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setEditColor(c)} style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: editColor === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--faint)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>Tracking source</div>
              <div className="chips" style={{ marginBottom: editSource === 'habits' ? 8 : 0 }}>
                {(['manual', 'habits'] as GoalMetricSource[]).map(s => (
                  <span key={s} className={`chip${editSource === s ? ' acc' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setEditSource(s)}>
                    {s === 'manual' ? 'Manual' : 'Habit'}
                  </span>
                ))}
                {goal.metric_source !== 'manual' && goal.metric_source !== 'habits' && (
                  <span
                    className={`chip${editSource === goal.metric_source ? ' acc' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => { setEditSource(goal.metric_source); setEditField(goal.metric_field ?? ''); }}
                  >
                    Auto-tracked
                  </span>
                )}
              </div>
              {editSource === 'habits' && (
                <select
                  value={editField}
                  onChange={e => setEditField(e.target.value)}
                  className="hs-input"
                  style={{ width: '100%', fontSize: 12 }}
                >
                  <option value="">— pick a habit —</option>
                  {habits.map(h => (
                    <option key={h.id} value={h.id}>{h.label}</option>
                  ))}
                </select>
              )}
            </div>
            {editErr && <div style={{ fontSize: 12, color: 'var(--danger)', background: 'oklch(0.60 0.22 25 / .12)', border: '1px solid oklch(0.60 0.22 25 / .3)', borderRadius: 8, padding: '6px 10px' }}>{editErr}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1, fontSize: 12, padding: '7px 12px' }} onClick={saveEdit} disabled={!editTitle.trim() || editSaving}>
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
              <button className="btn ghost" style={{ fontSize: 12, padding: '7px 12px' }} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <GoalRing pct={Math.min(100, goal.pct)} color={ringColor} size={88} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{Math.min(100, goal.pct)}%</span>
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700, color: ringColor, lineHeight: 1 }}>
                {fmt(goal.current_value, goal.target_unit)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 4 }}>of {fmt(goal.target_value, goal.target_unit)}</div>
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: ringColor, background: ringColor + '20', border: '1px solid ' + ringColor + '40', borderRadius: 20, padding: '2px 9px' }}>
                  {PACE_LABEL[goal.pace_status]}
                </span>
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', color: 'var(--faint)', marginBottom: 8, textTransform: 'uppercase' }}>Milestones</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {milestones.map(m => (
                <div key={m.pct} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, color: m.reached ? 'var(--ok)' : 'var(--faint)', width: 12, textAlign: 'center' }}>{m.reached ? '●' : '○'}</span>
                  <div style={{ flex: 1, height: 4, borderRadius: 4, background: m.reached ? catMeta.color : 'var(--ph)' }} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: m.reached ? 'var(--text)' : 'var(--faint)', width: 28, textAlign: 'right' }}>{m.pct}%</span>
                  {m.reached && m.date && (
                    <span style={{ fontSize: 10, color: 'var(--mut)', fontFamily: 'var(--mono)' }}>
                      {new Date(m.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { val: goal.timeframe_start, label: 'starts' },
              { val: goal.timeframe_end,   label: 'ends' },
              { val: String(goal.days_remaining) + 'd', label: 'remaining', mono: true },
            ].map(({ val, label, mono }) => (
              <div key={label}>
                <div style={{ fontFamily: mono ? 'var(--mono)' : 'var(--sans)', fontSize: mono ? 16 : 12, fontWeight: 700, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 10, color: 'var(--mut)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', color: 'var(--faint)', marginBottom: 5, textTransform: 'uppercase' }}>Tracking</div>
            <div style={{ fontSize: 12, color: 'var(--mut)' }}>
              {goal.metric_source === 'habits'
                ? `Habit: ${habits.find(h => h.id === goal.metric_field)?.label ?? goal.metric_field ?? '—'}`
                : goal.metric_source === 'books'
                ? 'Books finished'
                : goal.metric_source === 'workouts'
                ? (goal.metric_filter?.type
                    ? `${String(goal.metric_filter.type).replace(/([a-z])([A-Z])/g, '$1 $2')} sessions (Garmin)`
                    : 'All workouts (Garmin)')
                : goal.metric_source === 'strava_activities'
                ? 'Strava activities'
                : goal.metric_source === 'daily_stats'
                ? 'Daily stats'
                : goal.metric_source === 'wellness_logs'
                ? 'Wellness logs'
                : goal.metric_source === 'nutrition_logs'
                ? 'Nutrition logs'
                : 'Manual entries'}
            </div>
          </div>

          {goal.metric_source === 'manual' && (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', color: 'var(--faint)', marginBottom: 8, textTransform: 'uppercase' }}>Log Progress</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="hs-input" type="number" placeholder={`Value${goal.target_unit ? ` (${goal.target_unit})` : ''}`}
                    value={logVal} onChange={e => setLogVal(e.target.value)} style={{ flex: 1 }} />
                  <input className="tsk-date-input" type="date" value={logDate}
                    max={homeDateStr()} onChange={e => setLogDate(e.target.value)} />
                </div>
                <input className="hs-input" placeholder="Note (optional)" value={logNote} onChange={e => setLogNote(e.target.value)} />
                <button className="btn" style={{ fontSize: 12, padding: '7px 14px', alignSelf: 'flex-start' }}
                  disabled={!logVal || logging} onClick={submitLog}>
                  {logging ? 'Saving…' : '+ Log entry'}
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--card-bd)' }}>
            <button className="btn ghost" style={{ fontSize: 11, padding: '5px 10px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={abandon} disabled={saving}>Abandon goal</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Source options for the add modal ──────────────────────────────────────────

type SourceOption = {
  id:              string;
  label:           string;
  glyph:           string;
  category:        GoalCategory;
  metric_source:   GoalMetricSource;
  metric_field:    string | null;
  base_filter:     Record<string, unknown> | null;
  threshold:       number | null;
  threshold_label: string | null;
  default_unit:    string;
  default_title:   string;
  default_tf:      GoalTimeframe;
};

const STATIC_SOURCES: SourceOption[] = [
  // Fitness
  { id:'steps',    label:'Steps / day',      glyph:'○', category:'fitness',  metric_source:'daily_stats',       metric_field:'steps',              base_filter:null,               threshold:10000, threshold_label:'min steps per day',    default_unit:'days',     default_title:'Hit 10k steps {n} days',   default_tf:'monthly' },
  { id:'sleep',    label:'Sleep quality',    glyph:'◑', category:'fitness',  metric_source:'wellness_logs',     metric_field:'sleep_duration_min', base_filter:null,               threshold:420,   threshold_label:'min minutes of sleep',  default_unit:'days',     default_title:'Sleep 7+ hours {n} nights', default_tf:'monthly' },
  { id:'actcal',   label:'Active calories',  glyph:'♡', category:'fitness',  metric_source:'daily_stats',       metric_field:'active_calories',    base_filter:null,               threshold:500,   threshold_label:'min active cal/day',    default_unit:'days',     default_title:'Burn 500 cal {n} days',    default_tf:'monthly' },
  { id:'run_mi',   label:'Running distance', glyph:'↗', category:'fitness',  metric_source:'strava_activities', metric_field:'distance_m',         base_filter:{sport_type:'Run'}, threshold:null,  threshold_label:null,                    default_unit:'mi',       default_title:'Run {n} miles',            default_tf:'monthly' },
  { id:'ride_mi',  label:'Cycling distance', glyph:'◈', category:'fitness',  metric_source:'strava_activities', metric_field:'distance_m',         base_filter:{sport_type:'Ride'},threshold:null,  threshold_label:null,                    default_unit:'mi',       default_title:'Bike {n} miles',           default_tf:'monthly' },
  { id:'lifting',  label:'Lifting sessions (Garmin)', glyph:'↑', category:'fitness', metric_source:'workouts', metric_field:null, base_filter:{type:'WeightTraining'}, threshold:null, threshold_label:null, default_unit:'days', default_title:'Lift {n} days', default_tf:'monthly' },
  { id:'protein',  label:'Protein goal',     glyph:'◆', category:'fitness',  metric_source:'nutrition_logs',    metric_field:'protein_g',          base_filter:null,               threshold:150,   threshold_label:'min grams per day',     default_unit:'days',     default_title:'Hit protein goal {n} days', default_tf:'monthly' },
  { id:'calories', label:'Calorie target',   glyph:'◇', category:'fitness',  metric_source:'nutrition_logs',    metric_field:'calories',           base_filter:null,               threshold:2000,  threshold_label:'min calories per day',  default_unit:'days',     default_title:'Hit calorie goal {n} days', default_tf:'monthly' },
  // Academic
  { id:'books',    label:'Books finished',   glyph:'▭', category:'academic', metric_source:'books',             metric_field:null,                 base_filter:null,               threshold:null,  threshold_label:null,                    default_unit:'books',    default_title:'Read {n} books',           default_tf:'yearly'  },
];

const FITNESS_SOURCE_IDS  = new Set(['steps','sleep','actcal','run_mi','ride_mi','lifting','protein','calories']);
const ACTIVITY_HABIT_KW   = ['workout','run','bike','swim','exercise','gym','lift','walk','hike'];
const ACADEMIC_SOURCE_IDS = new Set(['books']);

// ── Add goal modal ────────────────────────────────────────────────────────────

const CATS_WITH_SOURCES = new Set<GoalCategory>(['fitness', 'academic']);

function AddGoalModal({ habits, onSave, onClose }: {
  habits:  { id: string; label: string }[];
  onSave:  (g: Partial<Goal>) => Promise<void>;
  onClose: () => void;
}) {
  type ModalStep = 'category' | 'source' | 'configure';

  const [step,   setStep]   = useState<ModalStep>('category');
  const [cat,    setCat]    = useState<GoalCategory | null>(null);
  const [src,    setSrc]    = useState<SourceOption | null>(null);
  const [icon,   setIcon]   = useState('◎');
  const [title,  setTitle]  = useState('');
  const [target, setTarget] = useState('');
  const [unit,   setUnit]   = useState('');
  const [tf,     setTf]     = useState<GoalTimeframe>('monthly');
  const [color,  setColor]  = useState(PRESET_COLORS[0]);
  const [thresh, setThresh] = useState('');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const buildHabitSources = (category: GoalCategory): SourceOption[] =>
    habits.map(h => ({
      id:              `habit_${h.id}`,
      label:           h.label,
      glyph:           '◐',
      category,
      metric_source:   'habits' as GoalMetricSource,
      metric_field:    h.id,
      base_filter:     null,
      threshold:       null,
      threshold_label: null,
      default_unit:    'days',
      default_title:   `${h.label} {n} days`,
      default_tf:      'monthly' as GoalTimeframe,
    }));

  const sourcesForCategory = (category: GoalCategory): { label: string; opts: SourceOption[] }[] => {
    if (category === 'fitness') {
      const allHabitSrcs  = buildHabitSources(category);
      const activityHabits = allHabitSrcs.filter(h =>
        ACTIVITY_HABIT_KW.some(kw => (h.metric_field ?? '').toLowerCase().includes(kw))
      );
      const otherHabits = allHabitSrcs.filter(h => !activityHabits.includes(h));
      return [
        ...(activityHabits.length ? [{ label: 'Your Workout Habits', opts: activityHabits }] : []),
        { label: 'Activity & Health', opts: STATIC_SOURCES.filter(s => FITNESS_SOURCE_IDS.has(s.id)) },
        ...(otherHabits.length ? [{ label: 'Other Habits', opts: otherHabits }] : []),
      ];
    }
    if (category === 'academic') {
      const bookSrc = STATIC_SOURCES.filter(s => ACADEMIC_SOURCE_IDS.has(s.id));
      const readHabit = buildHabitSources(category).filter(h => h.metric_field === 'read' || h.metric_field?.startsWith('read'));
      const otherHabits = buildHabitSources(category).filter(h => !readHabit.includes(h));
      return [
        { label: 'Reading', opts: bookSrc },
        ...(readHabit.length ? [{ label: 'Reading Habits', opts: readHabit }] : []),
        ...(otherHabits.length ? [{ label: 'Other Habits', opts: otherHabits }] : []),
      ];
    }
    return [];
  };

  const manualForCat = (category: GoalCategory): SourceOption => ({
    id: 'manual', label: 'Custom / Manual', glyph: '◎',
    category, metric_source: 'manual', metric_field: null,
    base_filter: null, threshold: null, threshold_label: null,
    default_unit: '', default_title: 'My goal', default_tf: 'monthly',
  });

  const applySource = (s: SourceOption, category: GoalCategory) => {
    setSrc(s);
    setIcon(s.glyph);
    setTitle(s.default_title);
    setTarget('');
    setUnit(s.default_unit);
    setTf(s.default_tf);
    setColor(CATEGORY_META[category].color);
    setThresh(s.threshold != null ? String(s.threshold) : '');
    setErr('');
    setStep('configure');
  };

  const pickCategory = (category: GoalCategory) => {
    setCat(category);
    if (CATS_WITH_SOURCES.has(category)) {
      setStep('source');
    } else {
      applySource(manualForCat(category), category);
    }
  };

  const submit = async () => {
    if (!src || !cat || !title.trim() || !target) return;
    const targetNum = parseFloat(target) || 1;
    const resolvedTitle = title.replace(/\{n\}/g, String(targetNum));
    let mf: Record<string, unknown> | null = src.base_filter ? { ...src.base_filter } : null;
    if (src.threshold !== null && thresh) mf = { ...(mf ?? {}), threshold: parseFloat(thresh) };
    setSaving(true); setErr('');
    try {
      await onSave({
        icon, title: resolvedTitle, category: cat,
        timeframe: tf, target_value: targetNum,
        target_unit: unit || null,
        metric_source: src.metric_source, metric_field: src.metric_field,
        metric_filter: mf, color,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
      setSaving(false);
    }
  };

  const lbl = (text: string) => (
    <div style={{ fontSize: 10, color: 'var(--faint)', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 5 }}>{text}</div>
  );

  const stepTitle =
    step === 'category'  ? 'What area do you want to improve?' :
    step === 'source'    ? 'What do you want to track?' :
    'Set your target';

  const backLabel =
    step === 'source'    ? '← Change category' :
    step === 'configure' && cat && CATS_WITH_SOURCES.has(cat) ? '← Change source' :
    '← Change category';

  const handleBack = () => {
    if (step === 'source')   setStep('category');
    else if (step === 'configure') {
      if (cat && CATS_WITH_SOURCES.has(cat)) setStep('source');
      else setStep('category');
    }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 151, width: 'min(560px, 94vw)', maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--bg2)',
        border: '1px solid var(--card-bd)', borderRadius: 22, padding: '22px 24px',
        boxShadow: '0 1px 0 var(--card-hi) inset, 0 32px 80px rgba(0,0,0,.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-.02em' }}>{stepTitle}</div>
            {step !== 'category' && (
              <button onClick={handleBack} style={{ background: 'none', border: 'none', color: 'var(--mut)', fontSize: 12, cursor: 'pointer', padding: 0, marginTop: 3 }}>
                {backLabel}
              </button>
            )}
          </div>
          <button className="hs-btn" style={{ width: 28, height: 28, fontSize: 14 }} onClick={onClose}>✕</button>
        </div>

        {/* ── Step 1: Category ── */}
        {step === 'category' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {(Object.entries(CATEGORY_META) as [GoalCategory, typeof CATEGORY_META[GoalCategory]][]).map(([id, meta]) => (
              <button
                key={id}
                onClick={() => pickCategory(id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  padding: '14px 16px', borderRadius: 14, textAlign: 'left',
                  background: 'var(--ph)', border: '1px solid var(--card-bd)',
                  borderLeft: `3px solid ${meta.color}`,
                  color: 'var(--text)', cursor: 'pointer',
                  transition: 'background .1s',
                  fontFamily: 'var(--sans)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--card-bg-flat)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--ph)'; }}
              >
                <span style={{ fontSize: 22, marginBottom: 6, lineHeight: 1, color: meta.color }}>{meta.glyph}</span>
                <span style={{ fontWeight: 700, fontSize: 14, display: 'block', marginBottom: 4 }}>{meta.label}</span>
                <span style={{ fontSize: 11, color: 'var(--mut)', lineHeight: 1.4 }}>{meta.subtitle}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Step 2: Source ── */}
        {step === 'source' && cat && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {sourcesForCategory(cat).map(({ label, opts }) => (
              <div key={label}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {opts.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => applySource(opt, cat)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '7px 12px', borderRadius: 10,
                        background: 'var(--ph)', border: '1px solid var(--card-bd)',
                        color: 'var(--text)', cursor: 'pointer',
                        fontSize: 13, fontFamily: 'var(--sans)',
                        transition: 'border-color .1s, background .1s',
                      }}
                      onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = CATEGORY_META[cat].color; el.style.background = 'var(--card-bg-flat)'; }}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = 'var(--card-bd)'; el.style.background = 'var(--ph)'; }}
                    >
                      <span style={{ fontSize: 13, color: CATEGORY_META[cat].color }}>{opt.glyph}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: 8 }}>Manual</div>
              <button
                onClick={() => applySource(manualForCat(cat), cat)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '7px 12px', borderRadius: 10,
                  background: 'var(--ph)', border: '1px solid var(--card-bd)',
                  color: 'var(--text)', cursor: 'pointer',
                  fontSize: 13, fontFamily: 'var(--sans)',
                  transition: 'border-color .1s, background .1s',
                }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = 'var(--accent)'; el.style.background = 'var(--card-bg-flat)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = 'var(--card-bd)'; el.style.background = 'var(--ph)'; }}
              >
                <span style={{ fontSize: 13, color: 'var(--mut)' }}>◎</span>
                Custom / Manual
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Configure ── */}
        {step === 'configure' && src && cat && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Category + source chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 11, padding: '3px 9px', borderRadius: 20,
                color: CATEGORY_META[cat].color,
                background: 'var(--chip-bg)',
                border: '1px solid var(--card-bd)',
              }}>
                {CATEGORY_META[cat].glyph} {CATEGORY_META[cat].label}
              </span>
              {src.metric_source !== 'manual' && (
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'var(--ph)', border: '1px solid var(--card-bd)', color: 'var(--mut)' }}>
                  {src.glyph} {src.label} · auto-tracked
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input className="hs-input" value={icon} onChange={e => setIcon(e.target.value)}
                style={{ width: 46, textAlign: 'center', fontSize: 16, padding: '6px 6px' }} />
              <input className="hs-input" placeholder="Goal title *" value={title}
                onChange={e => setTitle(e.target.value)} style={{ flex: 1 }} autoFocus />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: '0 0 120px' }}>
                {lbl('Target *')}
                <input className="hs-input" type="number" min={0} placeholder="e.g. 20"
                  value={target} onChange={e => setTarget(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div style={{ flex: 1 }}>
                {lbl('Unit')}
                <input className="hs-input" placeholder="days, km, books…"
                  value={unit} onChange={e => setUnit(e.target.value)} style={{ width: '100%' }} />
              </div>
            </div>

            {src.threshold !== null && (
              <div>
                {lbl(`Qualify days where ${src.metric_field?.replace(/_/g, ' ')} is at least`)}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input className="hs-input" type="number" min={0} value={thresh}
                    onChange={e => setThresh(e.target.value)} style={{ width: 110 }} />
                  <span style={{ fontSize: 11, color: 'var(--mut)' }}>{src.threshold_label}</span>
                </div>
              </div>
            )}

            <div>
              {lbl('Timeframe')}
              <div className="chips">
                {(['daily','weekly','monthly','yearly'] as GoalTimeframe[]).map(t => (
                  <span key={t} className={`chip${tf === t ? ' acc' : ''}`}
                    style={{ cursor: 'pointer' }} onClick={() => setTf(t)}>{t}</span>
                ))}
              </div>
            </div>

            <div>
              {lbl('Color')}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)} style={{
                    width: 22, height: 22, borderRadius: '50%', background: c,
                    border: color === c ? '2px solid var(--text)' : '2px solid transparent',
                    cursor: 'pointer', padding: 0,
                  }} />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div style={{ position: 'relative', background: 'var(--ph)', border: '1px solid var(--card-bd)', borderRadius: 12, padding: '11px 14px', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: CATEGORY_META[cat].color, borderRadius: '12px 0 0 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 8 }}>
                <span style={{ fontSize: 16, color: CATEGORY_META[cat].color }}>{icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{(title || 'Goal title').replace(/\{n\}/g, target || '?')}</div>
                  <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 2 }}>{target || '0'} {unit || 'units'} · {tf}</div>
                </div>
              </div>
            </div>

            {err && (
              <div style={{ fontSize: 12, color: 'var(--danger)', background: 'oklch(0.60 0.22 25 / .12)', border: '1px solid oklch(0.60 0.22 25 / .3)', borderRadius: 8, padding: '7px 10px' }}>{err}</div>
            )}

            <div style={{ display: 'flex', gap: 8, paddingTop: 2 }}>
              <button className="btn" style={{ flex: 1, fontSize: 13, padding: '9px 16px' }}
                onClick={submit} disabled={!title.trim() || !target || saving}>
                {saving ? 'Creating…' : '✓ Create goal'}
              </button>
              <button className="btn ghost" style={{ fontSize: 13, padding: '9px 16px' }} onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ fontSize: 48, opacity: .3 }}>◎</div>
      <div style={{ fontWeight: 700, fontSize: 17 }}>No active goals</div>
      <div style={{ fontSize: 13, color: 'var(--mut)', maxWidth: 320 }}>
        Goals connect all your data sources — books read, habits completed, km run — into one clear picture of your progress.
      </div>
      <button className="btn" style={{ fontSize: 13, padding: '10px 22px' }} onClick={onAdd}>+ Set your first goal</button>
    </div>
  );
}

// ── Inline goal add (with presets) ──────────────────────────────────────────────

const QUICK_CATS: GoalCategory[] = ['fitness','faith','academic','finance','professional','other'];

function pad2(n: number) { return String(n).padStart(2, '0'); }
function monthStartKey(y: number, m: number) { return `${y}-${pad2(m + 1)}-01`; }
function monthEndKey(y: number, m: number)   { return `${y}-${pad2(m + 1)}-${pad2(new Date(y, m + 1, 0).getDate())}`; }

function GoalQuickAdd({ timeframe, year, month, onAdd, onCancel }: {
  timeframe: 'monthly' | 'yearly';
  year:      number;
  month:     number; // ignored for yearly
  onAdd:     (fields: Partial<Goal>) => Promise<void>;
  onCancel:  () => void;
}) {
  const [title,  setTitle]  = useState('');
  const [target, setTarget] = useState('');
  const [unit,   setUnit]   = useState('');
  const [cat,    setCat]    = useState<GoalCategory>('other');
  const [icon,   setIcon]   = useState(CATEGORY_META.other.glyph);
  const [color,  setColor]  = useState(CATEGORY_META.other.color);
  const [metric, setMetric] = useState<{ source: GoalMetricSource; field: string | null; filter: Record<string, unknown> | null }>(
    { source: 'manual', field: null, filter: null });
  const [saving, setSaving] = useState(false);

  const presets = GOAL_TEMPLATES.filter(t => t.timeframe === timeframe);

  const fillFromPreset = (t: GoalTemplate) => {
    setTitle(t.title.replace(/\{n\}/g, String(t.target_value)));
    setTarget(String(t.target_value));
    setUnit(t.target_unit ?? '');
    setCat(t.category);
    setIcon(t.icon);
    setColor(t.color);
    setMetric({ source: t.metric_source, field: t.metric_field, filter: t.metric_filter });
  };

  // Manually choosing a category switches to a plain manual goal
  const pickCat = (c: GoalCategory) => {
    setCat(c);
    setIcon(CATEGORY_META[c].glyph);
    setColor(CATEGORY_META[c].color);
    setMetric({ source: 'manual', field: null, filter: null });
  };

  const start = timeframe === 'monthly' ? monthStartKey(year, month) : `${year}-01-01`;
  const end   = timeframe === 'monthly' ? monthEndKey(year, month)   : `${year}-12-31`;

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await onAdd({
        title:         title.trim().replace(/\{n\}/g, target || '1'),
        category:      cat,
        timeframe,
        target_value:  target ? Number(target) : 1,
        target_unit:   unit.trim() || null,
        start_date:    start,
        end_date:      end,
        metric_source: metric.source,
        metric_field:  metric.field,
        metric_filter: metric.filter,
        color,
        icon,
      });
      setTitle(''); setTarget(''); setUnit(''); setMetric({ source: 'manual', field: null, filter: null });
      setCat('other'); setIcon(CATEGORY_META.other.glyph); setColor(CATEGORY_META.other.color);
    } finally { setSaving(false); }
  };

  const periodLabel = timeframe === 'monthly' ? `${MONTH_NAMES[month]} ${year}` : `${year}`;

  return (
    <div style={{
      background: 'var(--ph)', border: '1px solid var(--card-bd)', borderRadius: 14,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 14,
    }}>
      {/* Presets */}
      {presets.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: 6 }}>
            Quick add
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {presets.map((t, i) => (
              <button
                key={i}
                onClick={() => fillFromPreset(t)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 11px', borderRadius: 20, cursor: 'pointer',
                  background: 'var(--chip-bg)', border: '1px solid var(--card-bd)',
                  color: 'var(--text)', fontSize: 12, fontFamily: 'var(--sans)',
                  transition: 'border-color .1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = CATEGORY_META[t.category].color; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--card-bd)'; }}
              >
                <span style={{ color: CATEGORY_META[t.category].color }}>{t.icon}</span>
                {t.label.replace(/\{n\}/g, String(t.target_value))}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Title + target */}
      <input
        className="hs-input"
        placeholder={`Goal for ${periodLabel}… (or pick a preset above)`}
        value={title}
        autoFocus
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        style={{ fontSize: 14 }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="hs-input" type="number" min={0} placeholder="Target #"
          value={target} onChange={e => setTarget(e.target.value)} style={{ width: 100, fontSize: 13 }} />
        <input className="hs-input" placeholder="unit (days, times…)"
          value={unit} onChange={e => setUnit(e.target.value)} style={{ width: 150, fontSize: 13 }} />
      </div>
      <div className="chips" style={{ flexWrap: 'wrap' }}>
        {QUICK_CATS.map(c => (
          <span
            key={c}
            className={`chip${cat === c ? ' acc' : ''}`}
            style={{ cursor: 'pointer', ...(cat === c ? { color: CATEGORY_META[c].color, borderColor: CATEGORY_META[c].color } : {}) }}
            onClick={() => pickCat(c)}
          >
            <span style={{ marginRight: 4 }}>{CATEGORY_META[c].glyph}</span>{CATEGORY_META[c].label}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={submit} disabled={!title.trim() || saving} style={{ fontSize: 12, padding: '7px 14px' }}>
          {saving ? 'Adding…' : '✓ Add goal'}
        </button>
        <button className="btn ghost" onClick={onCancel} style={{ fontSize: 12, padding: '7px 14px' }}>Cancel</button>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function GoalsDeep() {
  const { setTab }                                           = useDashboard();
  const { goals, loading, addGoal, updateGoal, logProgress } = useGoals();
  const { habits }                                           = useHabits();

  const now = new Date();
  const [viewYear,    setViewYear]    = useState(now.getFullYear());
  const [viewMonth,   setViewMonth]   = useState(now.getMonth());
  const [selected,    setSelected]    = useState<GoalWithProgress | null>(null);
  const [adding,      setAdding]      = useState<'monthly' | 'yearly' | null>(null);
  const [showAddLong, setShowAddLong] = useState(false);

  const habitList = habits.map(h => ({ id: h.id, label: h.label }));

  useEffect(() => {
    if (selected) {
      const fresh = goals.find(g => g.id === selected.id);
      if (fresh) setSelected(fresh);
    }
  }, [goals]); // eslint-disable-line react-hooks/exhaustive-deps

  const yearOf  = (g: GoalWithProgress) => g.start_date ? new Date(g.start_date + 'T12:00').getFullYear() : null;
  const monthOf = (g: GoalWithProgress) => g.start_date ? new Date(g.start_date + 'T12:00').getMonth() : null;

  const monthGoals = goals.filter(g => g.timeframe === 'monthly' && yearOf(g) === viewYear && monthOf(g) === viewMonth);
  const yearGoals  = goals.filter(g => g.timeframe === 'yearly'  && yearOf(g) === viewYear);
  const longTerm   = goals.filter(g => g.timeframe === 'custom');

  const isThisMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  const prevMonth = () => { setAdding(null); if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { setAdding(null); if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); };
  const goToday   = () => { setAdding(null); setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); };

  const handleAdd = async (fields: Partial<Goal>) => { await addGoal(fields); setAdding(null); };

  // Quick-toggle "1 and done" goals. Log progress dated within the goal's own
  // period so it counts (past-month goals would otherwise miss the window).
  const toggleDone = async (g: GoalWithProgress) => {
    const completed = g.current_value >= g.target_value;
    const delta = completed ? -g.current_value : (g.target_value - g.current_value);
    if (delta === 0) return;
    await logProgress(g.id, delta, g.timeframe_end);
  };

  // Tracked goals (rings, auto- or multi-step) render big; "1 and done"
  // manual goals render as compact check-off rows. Behind goals surface first.
  const isCheckOff = (g: GoalWithProgress) => g.metric_source === 'manual' && Number(g.target_value) === 1;
  const SEVERITY: Record<GoalPaceStatus, number> = { behind: 0, at_risk: 1, on_track: 2, completed: 3 };

  const goalGrids = (list: GoalWithProgress[]) => {
    const tracked = list.filter(g => !isCheckOff(g)).sort((a, b) => SEVERITY[a.pace_status] - SEVERITY[b.pace_status]);
    const checks  = list.filter(isCheckOff).sort((a, b) =>
      Number(a.current_value >= a.target_value) - Number(b.current_value >= b.target_value));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tracked.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
            {tracked.map(g => <GoalCard key={g.id} goal={g} onClick={() => setSelected(g)} onToggleDone={toggleDone} />)}
          </div>
        )}
        {checks.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))', gap: 10 }}>
            {checks.map(g => <GoalCard key={g.id} goal={g} onClick={() => setSelected(g)} onToggleDone={toggleDone} />)}
          </div>
        )}
      </div>
    );
  };

  const doneOf = (list: GoalWithProgress[]) => list.filter(g => g.current_value >= g.target_value).length;
  // The lifting tracker feeds the hero strip — current month's workouts-source goal
  const liftGoal = monthGoals.find(g => g.metric_source === 'workouts');

  const sectionHead = (label: string, count: number, addBtn?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-.01em' }}>
        {label}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mut)', fontWeight: 400, marginLeft: 8 }}>
          {count}
        </span>
      </div>
      {addBtn}
    </div>
  );

  return (
    <div className="canvas">
      {showAddLong && (
        <AddGoalModal habits={habitList} onSave={async f => { await addGoal(f); }} onClose={() => setShowAddLong(false)} />
      )}
      {selected && (
        <GoalDetailDrawer
          goal={selected}
          habits={habitList}
          onClose={() => setSelected(null)}
          onUpdate={async (id, patch) => {
            await updateGoal(id, patch);
            if (patch.status && patch.status !== 'active') setSelected(null);
          }}
          onLogProgress={logProgress}
        />
      )}

      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>

      <div className="deep-head">
        <div>
          <h1>Goals</h1>
          <div className="sub">{monthGoals.length} THIS MONTH · {yearGoals.length} THIS YEAR · {longTerm.length} LONG-TERM</div>
        </div>
      </div>

      {/* ── Summary strip ── */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 13, marginBottom: 18 }}>
          <Panel className="metric">
            <div className="stat">
              <div className="n">{doneOf(monthGoals)}<small>/{monthGoals.length}</small></div>
              <div className="l">{MONTH_NAMES[viewMonth].slice(0, 3)} goals done</div>
            </div>
          </Panel>
          {liftGoal && (
            <Panel className="metric">
              <div className="stat">
                <div className="n" style={{ color: PACE_COLOR[liftGoal.pace_status] }}>
                  {Math.round(liftGoal.current_value)}<small>/{Math.round(liftGoal.target_value)}</small>
                </div>
                <div className="l">Lift days</div>
              </div>
            </Panel>
          )}
          <Panel className="metric">
            <div className="stat">
              <div className="n">{doneOf(yearGoals)}<small>/{yearGoals.length}</small></div>
              <div className="l">{viewYear} goals done</div>
            </div>
          </Panel>
          <Panel className="metric">
            <div className="stat">
              <div className="n">{doneOf(longTerm)}<small>/{longTerm.length}</small></div>
              <div className="l">Long-term done</div>
            </div>
          </Panel>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--faint)', fontSize: 13, padding: '20px 0' }}>Loading goals…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>

          {/* ── Monthly — month nav lives in the section header ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <button className="tr-nav" onClick={prevMonth} aria-label="Previous month">‹</button>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', minWidth: 150, textAlign: 'center' }}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </div>
              <button className="tr-nav" onClick={nextMonth} aria-label="Next month">›</button>
              {!isThisMonth && (
                <button onClick={goToday} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', padding: 0 }}>
                  today
                </button>
              )}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mut)' }}>{monthGoals.length}</span>
              {adding !== 'monthly' && (
                <button className="btn" onClick={() => setAdding('monthly')} style={{ fontSize: 12, padding: '7px 14px', marginLeft: 'auto' }}>+ Add goal</button>
              )}
            </div>
            {adding === 'monthly' && (
              <GoalQuickAdd timeframe="monthly" year={viewYear} month={viewMonth} onAdd={handleAdd} onCancel={() => setAdding(null)} />
            )}
            {monthGoals.length > 0 ? goalGrids(monthGoals) : adding !== 'monthly' && (
              <div style={{
                textAlign: 'center', padding: '36px 24px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 10, border: '1px dashed var(--card-bd)', borderRadius: 16,
              }}>
                <div style={{ fontSize: 30, opacity: .3 }}>◎</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>No goals for {MONTH_NAMES[viewMonth]} yet</div>
                <button className="btn" onClick={() => setAdding('monthly')} style={{ fontSize: 13, padding: '8px 18px' }}>+ Add a goal</button>
              </div>
            )}
          </div>

          {/* ── Yearly (same treatment as monthly) ── */}
          <div>
            {sectionHead(
              `${viewYear} goals`, yearGoals.length,
              adding !== 'yearly' && (
                <button className="btn" onClick={() => setAdding('yearly')} style={{ fontSize: 12, padding: '7px 14px' }}>+ Add goal</button>
              ),
            )}
            {adding === 'yearly' && (
              <GoalQuickAdd timeframe="yearly" year={viewYear} month={viewMonth} onAdd={handleAdd} onCancel={() => setAdding(null)} />
            )}
            {yearGoals.length > 0 ? goalGrids(yearGoals) : adding !== 'yearly' && (
              <div style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic', padding: '4px 2px' }}>
                No yearly goals for {viewYear}.
              </div>
            )}
          </div>

          {/* ── Long-term (5-year) ── */}
          <div>
            {sectionHead(
              'Long-term goals', longTerm.length,
              <button className="btn ghost" onClick={() => setShowAddLong(true)} style={{ fontSize: 12, padding: '7px 14px' }}>+ Add</button>,
            )}
            {longTerm.length > 0 ? goalGrids(longTerm) : (
              <div style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic', padding: '4px 2px' }}>
                No long-term goals yet.
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
