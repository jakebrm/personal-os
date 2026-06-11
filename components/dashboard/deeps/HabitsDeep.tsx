'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ResponsiveContainer, ComposedChart, Bar, Cell, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { Panel } from '../Panel';
import { WakeTimeCard } from '../WakeTimeCard';
import { useDashboard } from '../context';
import { useDemo } from '../DemoContext';
import { useHabits, HabitRingBtn, calcStreak } from '../HabitsContext';
import { Tile, Seg, TOOLTIP_STYLE, TOOLTIP_LABEL, TOOLTIP_ITEM, PAL } from '@/components/health/shared';
import {
  type HabitDef,
  localDateKey, lastNDays, daysInMonth, completionRate, dateToKey,
} from '@/lib/habits';

// ── Constants ─────────────────────────────────────────────────────────────────

const DOW        = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DOW_MON    = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']; // Mon-first
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── Pure helpers ──────────────────────────────────────────────────────────────

function monthRate(
  year: number, month: number,
  history: Map<string, string[]>,
  habits: HabitDef[],
  today: string,
): number {
  if (habits.length === 0) return 0;
  const habitIds = new Set(habits.map(h => h.id));
  const days = daysInMonth(year, month).filter(d => d <= today);
  if (days.length === 0) return 0;
  const total = days.reduce((s, d) => {
    const done = history.get(d) ?? [];
    return s + done.filter(id => habitIds.has(id)).length;
  }, 0);
  return Math.round((total / (days.length * habits.length)) * 100);
}

function monthOf(offset: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return { year: d.getFullYear(), month: d.getMonth() };
}

// Longest streak within 90 days of history
function longestStreak(id: string, history: Map<string, string[]>): number {
  const days = lastNDays(90);
  let best = 0, run = 0;
  for (const d of days) {
    if ((history.get(d) ?? []).includes(id)) { run++; if (run > best) best = run; }
    else run = 0;
  }
  return best;
}

// Bar fill shared by the completion charts: perfect / partial / missed
function pctFill(pct: number, perfect: boolean): string {
  if (perfect || pct >= 100) return 'var(--ok)';
  if (pct > 0) return 'oklch(0.80 0.10 80 / .80)';
  return 'rgba(255,255,255,.07)';
}

// ── Wake-time helpers ─────────────────────────────────────────────────────────

/** "HH:MM" (24h) → minutes since midnight. */
function wakeMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes since midnight → "7:05 AM". */
function fmtWake(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
}

// ── Sparkline (30-day bars) ───────────────────────────────────────────────────

function Sparkline({ id, days, history }: {
  id: string;
  days: string[];
  history: Map<string, string[]>;
}) {
  const W = 3, G = 1, H = 16;
  const svgW = days.length * (W + G) - G;
  return (
    <svg width={svgW} height={H} style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}>
      {days.map((d, i) => {
        const v = (history.get(d) ?? []).includes(id);
        return (
          <rect
            key={d}
            x={i * (W + G)}
            y={v ? 0 : H - 5}
            width={W}
            height={v ? H : 5}
            rx={1}
            fill={v ? 'var(--ok)' : 'rgba(255,255,255,.09)'}
          />
        );
      })}
    </svg>
  );
}

// ── Heatmap tooltip ───────────────────────────────────────────────────────────

type TipState = { date: string; done: string[]; x: number; y: number } | null;

function HeatmapTooltip({ tip, habits, wakeTime }: { tip: NonNullable<TipState>; habits: HabitDef[]; wakeTime?: string }) {
  const [, m, d] = tip.date.split('-').map(Number);
  const label     = `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}`;
  const doneSet   = new Set(tip.done);
  // Only count IDs that are still in the current habits list
  const doneCount = habits.filter(h => doneSet.has(h.id)).length;
  const pct       = habits.length > 0 ? Math.round((doneCount / habits.length) * 100) : 0;

  // Portal to document.body so backdrop-filter on .card ancestors can't trap it
  return createPortal(
    <div style={{
      position: 'fixed',
      left: tip.x, top: tip.y - 10,
      transform: 'translate(-50%, -100%)',
      zIndex: 9999, pointerEvents: 'none',
      background: 'var(--bg2)',
      border: '1px solid var(--card-bd)',
      borderRadius: 10,
      padding: '9px 12px',
      boxShadow: '0 10px 32px rgba(0,0,0,.75)',
      minWidth: 148,
      fontFamily: 'var(--sans)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>{label}</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, marginLeft: 10,
          color: pct === 100 ? 'var(--ok)' : pct > 0 ? 'var(--warn)' : 'var(--mut)',
        }}>
          {doneCount}/{habits.length} · {pct}%
        </span>
      </div>
      {wakeTime && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0 7px',
          marginBottom: 5, borderBottom: '1px solid var(--card-bd)',
          fontSize: 11.5, color: 'var(--text)',
        }}>
          <span style={{ color: 'var(--accent)' }}>☀</span>
          woke <b style={{ fontFamily: 'var(--mono)' }}>{fmtWake(wakeMinutes(wakeTime))}</b>
        </div>
      )}
      {habits.map(h => (
        <div key={h.id} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0',
          fontSize: 11,
          color: doneSet.has(h.id) ? 'var(--text)' : 'var(--faint)',
        }}>
          <span style={{ fontSize: 6, color: doneSet.has(h.id) ? 'var(--ok)' : 'rgba(255,255,255,.18)' }}>●</span>
          {h.label}
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ── Day edit panel (fixed overlay, not inside any overflow:hidden container) ──

function DayEditPanel({ date, habits, done, onToggle, onClose }: {
  date: string;
  habits: HabitDef[];
  done: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const [, m, d] = date.split('-').map(Number);
  const label     = `${MONTH_NAMES[m - 1]} ${d}`;
  const doneSet   = new Set(done);
  const doneCount = habits.filter(h => doneSet.has(h.id)).length;
  const pct       = habits.length > 0 ? Math.round((doneCount / habits.length) * 100) : 0;
  const pctColor  = pct === 100 ? 'var(--ok)' : pct >= 50 ? 'var(--warn)' : 'var(--mut)';

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(3px)' }}
      />
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 201,
        width: 'min(300px, calc(100vw - 28px))',
        background: 'linear-gradient(155deg,rgba(255,255,255,.13),rgba(255,255,255,.05))',
        border: '1px solid var(--card-bd)',
        borderRadius: 20,
        padding: '20px 22px',
        boxShadow: '0 1px 0 rgba(255,255,255,.18) inset, 0 28px 72px rgba(0,0,0,.85)',
        backdropFilter: 'blur(32px) saturate(1.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 18, fontWeight: 800, letterSpacing: '-.02em' }}>
              {label}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: pctColor, marginTop: 3 }}>
              {doneCount}/{habits.length} done · {pct}%
            </div>
          </div>
          <button className="hs-btn" style={{ width: 28, height: 28, fontSize: 13 }} onClick={onClose}>✕</button>
        </div>

        {/* Completion bar */}
        <div className="prog" style={{ marginBottom: 16 }}>
          <i style={{ width: `${pct}%`, background: pctColor }} />
        </div>

        {/* Habit toggles */}
        {habits.length === 0 ? (
          <div className="hm-empty">No habits configured.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {habits.map(h => {
              const isDone = done.includes(h.id);
              return (
                <button
                  key={h.id}
                  onClick={() => onToggle(h.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px',
                    background: isDone ? 'oklch(0.74 0.10 155 / .18)' : 'var(--ph)',
                    border: `1px solid ${isDone ? 'oklch(0.74 0.10 155 / .45)' : 'var(--card-bd)'}`,
                    borderRadius: 10, cursor: 'pointer',
                    color: isDone ? 'var(--text)' : 'var(--mut)',
                    fontSize: 13, fontWeight: isDone ? 600 : 400,
                    fontFamily: 'var(--sans)',
                    transition: 'all .12s',
                    width: '100%', textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    border: `1.5px solid ${isDone ? 'var(--ok)' : 'rgba(255,255,255,.2)'}`,
                    background: isDone ? 'var(--ok)' : 'transparent',
                    display: 'grid', placeItems: 'center',
                    fontSize: 10, color: '#fff',
                  }}>
                    {isDone ? '✓' : ''}
                  </span>
                  {h.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ── Heatmap with hover tooltip + click-to-edit ────────────────────────────────

function HeatmapWithTip({ year, month, history, habits, today, wake, onDayClick }: {
  year: number; month: number;
  history: Map<string, string[]>;
  habits: HabitDef[];
  today: string;
  wake: Map<string, string>;
  onDayClick: (date: string) => void;
}) {
  const [tip, setTip] = useState<TipState>(null);
  const days     = daysInMonth(year, month);
  const firstDow = new Date(year, month, 1).getDay();
  const blanks   = Array.from({ length: firstDow }, (_, i) => i);

  return (
    <>
      {tip && <HeatmapTooltip tip={tip} habits={habits} wakeTime={wake.get(tip.date)} />}
      <div className="hm-grid">
        {DOW.map((d, i) => <div key={i} className="hm-dow">{d}</div>)}
        {blanks.map(i => <div key={`b${i}`} className="hm-cell hm-blank" />)}
        {(() => {
          const habitIds = new Set(habits.map(h => h.id));
          return days.map(key => {
          const doneDays  = history.get(key) ?? [];
          const isFuture  = key > today;
          const doneValid = doneDays.filter(id => habitIds.has(id)).length;
          const ratio     = habits.length > 0 ? doneValid / habits.length : 0;
          const dayNum   = parseInt(key.slice(8), 10);
          let cls = 'hm-cell';
          if (isFuture || habits.length === 0) cls += ' hm-future';
          else if (ratio === 0) cls += ' hm-none';
          else if (ratio >= 1)  cls += ' hm-full';
          else                  cls += ' hm-partial';
          if (key === today) cls += ' hm-today';
          return (
            <div
              key={key}
              className={cls}
              style={!isFuture ? { cursor: 'pointer' } : undefined}
              onClick={!isFuture ? () => { setTip(null); onDayClick(key); } : undefined}
              onMouseEnter={isFuture ? undefined : e => {
                const r = e.currentTarget.getBoundingClientRect();
                setTip({ date: key, done: doneDays, x: r.left + r.width / 2, y: r.top });
              }}
              onMouseLeave={() => setTip(null)}
            >
              <span className="hm-day-num">{dayNum}</span>
            </div>
          );
        });
        })()}
      </div>
    </>
  );
}

// ── Consistency (daily completion % + rolling average) ───────────────────────

function ConsistencyCard({ history, habits }: {
  history: Map<string, string[]>;
  habits: HabitDef[];
}) {
  const [range, setRange] = useState<7 | 28 | 84>(7);
  const total    = habits.length;
  const habitIds = new Set(habits.map(h => h.id));
  const days     = lastNDays(range);

  const data = days.map(d => {
    // Only count habit IDs that exist in the current config so the bars match the heatmap
    const count = (history.get(d) ?? []).filter(id => habitIds.has(id)).length;
    const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
    const dd    = new Date(d + 'T12:00:00');
    return {
      d, count, pct,
      perfect: total > 0 && count >= total,
      label:   range === 7 ? DOW_MON[(dd.getDay() + 6) % 7] : `${dd.getMonth() + 1}/${dd.getDate()}`,
    };
  }).map((row, i, arr) => {
    const win = arr.slice(Math.max(0, i - 6), i + 1);
    return { ...row, avg7: Math.round(win.reduce((s, r) => s + r.pct, 0) / win.length) };
  });

  const completions = data.reduce((s, r) => s + r.count, 0);
  const overallPct  = total > 0 ? Math.round((completions / (days.length * total)) * 100) : 0;
  const perfectDays = data.filter(r => r.perfect).length;
  const best        = data.reduce((a, b) => (b.count > a.count ? b : a), data[0]);
  const bestLabel   = best && best.count > 0 ? `${best.label} ${best.count}/${total}` : '—';

  return (
    <Panel
      glyph="◈"
      title="Consistency"
      meta={
        <span onClick={e => e.stopPropagation()}>
          <Seg
            options={[{ id: 7, label: '7D' }, { id: 28, label: '4W' }, { id: 84, label: '12W' }]}
            value={range} onChange={setRange}
          />
        </span>
      }
    >
      {total === 0 ? (
        <div className="hm-empty">No habits configured.</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={150}>
            <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -14 }} barCategoryGap={range === 7 ? '24%' : '12%'}>
              <CartesianGrid stroke="var(--n4)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                tickLine={false} axisLine={false} interval={range === 7 ? 0 : range === 28 ? 3 : 13} />
              <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 9.5, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM}
                formatter={(v, name) => name === 'avg7'
                  ? [`${v}%`, '7-day avg']
                  : [`${v}%`, 'completed']}
                labelFormatter={(label, payload) => {
                  const p = payload?.[0]?.payload as typeof data[number] | undefined;
                  return p ? `${p.d} · ${p.count}/${total} habits` : String(label);
                }}
              />
              <Bar dataKey="pct" radius={[3, 3, 0, 0]} name="pct">
                {data.map(r => (
                  <Cell key={r.d} fill={pctFill(r.pct, r.perfect)} />
                ))}
              </Bar>
              {range > 7 && (
                <Line type="monotone" dataKey="avg7" stroke="var(--viz)" strokeWidth={2}
                  dot={false} name="avg7" />
              )}
            </ComposedChart>
          </ResponsiveContainer>

          <div className="hx-tiles" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <Tile label="completions"  value={String(completions)} />
            <Tile label="completion %" value={`${overallPct}%`}
              color={overallPct >= 80 ? PAL.ok : overallPct >= 50 ? PAL.warn : undefined} />
            <Tile label="perfect days" value={String(perfectDays)} color={perfectDays > 0 ? PAL.ok : undefined} />
            <Tile label="best day"     value={bestLabel} color="var(--accent)" />
          </div>
        </>
      )}
    </Panel>
  );
}

// ── Streaks panel ─────────────────────────────────────────────────────────────

function StreaksPanel({ habits, done, history, today }: {
  habits: HabitDef[];
  done: string[];
  history: Map<string, string[]>;
  today: string;
}) {
  const last30    = lastNDays(30);
  const yesterday = lastNDays(2)[0];

  return (
    <Panel glyph="⚡" title="Streaks" meta={<span className="pill">30 days</span>}>
      {habits.length === 0 ? (
        <div className="hm-empty">No habits configured.</div>
      ) : (
        <div>
          {habits.map((h, i) => {
            const streak   = calcStreak(h.id, today, done, history);
            const longest  = longestStreak(h.id, history);
            const doneNow  = done.includes(h.id);
            const doneYest = (history.get(yesterday) ?? []).includes(h.id);

            // Color: green = on streak, amber = missed today (done yesterday), red = 2+ days missed
            const color = doneNow ? 'var(--ok)' : doneYest ? 'var(--warn)' : 'var(--danger)';
            const glyph = doneNow ? '●' : doneYest ? '◑' : '○';

            return (
              <div
                key={h.id}
                className="streaks-row"
                style={{
                  padding: '9px 0',
                  borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,.06)',
                }}
              >
                <span style={{ color, fontSize: 10, textAlign: 'center', lineHeight: 1 }}>{glyph}</span>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{h.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 1, display: 'flex', gap: 8 }}>
                    <span style={{ color, fontWeight: 600 }}>{streak}d streak</span>
                    <span>· best {longest}d</span>
                  </div>
                  {/* Current streak vs personal best */}
                  <div style={{ marginTop: 5, height: 3, borderRadius: 3, background: 'rgba(255,255,255,.07)', overflow: 'hidden', maxWidth: 200 }}>
                    <div style={{
                      height: '100%', borderRadius: 3, background: color,
                      width: `${longest > 0 ? Math.min(100, Math.round((streak / longest) * 100)) : 0}%`,
                      transition: 'width .4s cubic-bezier(.22,.61,.36,1)',
                      boxShadow: streak >= longest && streak > 0 ? `0 0 6px ${color}` : 'none',
                    }} />
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>
                    {streak}
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--faint)', marginTop: 1, fontFamily: 'var(--mono)' }}>
                    /{longest}
                  </div>
                </div>

                <span className="streaks-spark"><Sparkline id={h.id} days={last30} history={history} /></span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── Wake-up trend chart ───────────────────────────────────────────────────────

function WakeTrend({ wake }: { wake: Map<string, string> }) {
  const [range, setRange] = useState<14 | 30 | 90>(14);
  const days = lastNDays(range);

  const data = days.map(d => {
    const t  = wake.get(d);
    const dd = new Date(d + 'T12:00:00');
    return { d, label: `${dd.getMonth() + 1}/${dd.getDate()}`, min: t ? wakeMinutes(t) : null };
  });
  const mins = data.map(r => r.min).filter((v): v is number => v != null);

  const seg = (
    <span onClick={e => e.stopPropagation()}>
      <Seg
        options={[{ id: 14, label: '14D' }, { id: 30, label: '30D' }, { id: 90, label: '90D' }]}
        value={range} onChange={setRange}
      />
    </span>
  );

  if (mins.length === 0) {
    return (
      <Panel glyph="☀" title="Wake-up trend" meta={seg}>
        <div className="hm-empty">No wake-ups logged in this window — log your time and the trend builds here.</div>
      </Panel>
    );
  }

  const avg      = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
  const earliest = Math.min(...mins);
  const latest   = Math.max(...mins);
  // Std deviation = how repeatable the wake time is (the number to shrink)
  const sd = Math.round(Math.sqrt(mins.reduce((s, v) => s + (v - avg) ** 2, 0) / mins.length));

  // Y domain padded ±20 min, at least a 90-min window so a flat series isn't a flat line.
  let lo = earliest - 20;
  let hi = latest + 20;
  if (hi - lo < 90) { const mid = (hi + lo) / 2; lo = mid - 45; hi = mid + 45; }

  return (
    <Panel glyph="☀" title="Wake-up trend" meta={seg}>
      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--n4)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
            tickLine={false} axisLine={false} interval={range === 14 ? 1 : range === 30 ? 4 : 13} />
          <YAxis reversed domain={[Math.round(lo), Math.round(hi)]}
            tick={{ fontSize: 9, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
            tickFormatter={(v: number) => fmtWake(v)} tickLine={false} axisLine={false} width={56} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM}
            formatter={(v) => [fmtWake(Number(v)), 'woke up']}
            labelFormatter={(label, payload) =>
              (payload?.[0]?.payload as typeof data[number] | undefined)?.d ?? String(label)}
          />
          <ReferenceLine y={avg} stroke="rgba(255,255,255,.18)" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="min" stroke="var(--accent)" strokeWidth={2}
            connectNulls dot={{ r: 2.5, fill: 'var(--bg2)', stroke: 'var(--accent)', strokeWidth: 1.4 }} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="hx-tiles" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Tile label="average"     value={fmtWake(avg)} color="var(--accent)" />
        <Tile label="earliest"    value={fmtWake(earliest)} color={PAL.ok} />
        <Tile label="latest"      value={fmtWake(latest)} />
        <Tile label="consistency" value={`±${sd}`} unit="min"
          color={sd <= 25 ? PAL.ok : sd <= 50 ? PAL.warn : PAL.danger}
          sub={sd <= 25 ? 'locked in' : sd <= 50 ? 'drifting' : 'all over'} />
      </div>
    </Panel>
  );
}

// ── Rhythm (completion % by weekday) ──────────────────────────────────────────

function RhythmCard({ history, habits }: {
  history: Map<string, string[]>;
  habits: HabitDef[];
}) {
  const total    = habits.length;
  const habitIds = new Set(habits.map(h => h.id));

  // Last 12 full-ish weeks bucketed Monday-first — exposes which weekdays slip
  const acc = Array.from({ length: 7 }, () => ({ done: 0, poss: 0 }));
  for (const d of lastNDays(84)) {
    const idx = (new Date(d + 'T12:00:00').getDay() + 6) % 7;
    acc[idx].done += (history.get(d) ?? []).filter(id => habitIds.has(id)).length;
    acc[idx].poss += total;
  }
  const data = acc.map((a, i) => ({
    label: DOW_MON[i],
    pct:   a.poss > 0 ? Math.round((a.done / a.poss) * 100) : 0,
  }));

  const best  = data.reduce((a, b) => (b.pct > a.pct ? b : a), data[0]);
  const worst = data.reduce((a, b) => (b.pct < a.pct ? b : a), data[0]);
  const spread = best.pct - worst.pct;

  return (
    <Panel glyph="◐" title="Rhythm" meta={<span className="pill">12 weeks · by weekday</span>}>
      {total === 0 ? (
        <div className="hm-empty">No habits configured.</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={150}>
            <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -14 }} barCategoryGap="24%">
              <CartesianGrid stroke="var(--n4)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 9.5, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM}
                formatter={(v) => [`${v}%`, 'completion']}
              />
              <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
                {data.map(r => (
                  <Cell key={r.label} fill={pctFill(r.pct, r.pct >= 100)} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>

          <div className="hx-tiles" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <Tile label="strongest" value={best.label}  sub={`${best.pct}%`}  color={PAL.ok} />
            <Tile label="weakest"   value={worst.label} sub={`${worst.pct}%`} color={worst.pct < 50 ? PAL.danger : PAL.warn} />
            <Tile label="spread"    value={`${spread}`} unit="pts"
              color={spread <= 15 ? PAL.ok : spread <= 30 ? PAL.warn : PAL.danger}
              sub={spread <= 15 ? 'steady week' : 'uneven week'} />
          </div>
        </>
      )}
    </Panel>
  );
}

// ── Edit drawer ───────────────────────────────────────────────────────────────

function EditDrawer({ habits, setHabits, onClose }: {
  habits: HabitDef[];
  setHabits: (h: HabitDef[]) => Promise<void>;
  onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [addLabel,  setAddLabel]  = useState('');
  const [saving,    setSaving]    = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  const save = async (next: HabitDef[]) => {
    setSaving(true);
    await setHabits(next).finally(() => setSaving(false));
  };

  const startEdit  = (h: HabitDef) => { setEditingId(h.id); setEditLabel(h.label); };
  const confirmEdit = () => {
    const label = editLabel.trim();
    if (!label || !editingId) return;
    save(habits.map(h => h.id === editingId ? { ...h, label } : h));
    setEditingId(null);
  };
  const addHabit = () => {
    const label = addLabel.trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      + '_' + Date.now().toString(36).slice(-4);
    save([...habits, { id, label }]);
    setAddLabel('');
    addRef.current?.focus();
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
        width: 'min(300px, 100vw)', background: 'var(--bg2)',
        borderLeft: '1px solid var(--card-bd)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
        boxShadow: '-16px 0 48px rgba(0,0,0,.6)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 20px 14px', borderBottom: '1px solid var(--card-bd)',
          position: 'sticky', top: 0, background: 'var(--bg2)', zIndex: 1,
        }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Edit habits</span>
          {saving
            ? <span className="pill" style={{ fontSize: 11 }}>saving…</span>
            : <button className="hs-btn" style={{ fontSize: 16, width: 30, height: 30 }} onClick={onClose}>✕</button>
          }
        </div>

        <div style={{ padding: '14px 20px', flex: 1 }}>
          <div className="hs-list">
            {habits.map(h => (
              <div key={h.id} className="hs-row">
                {editingId === h.id ? (
                  <>
                    <input className="hs-input" value={editLabel} autoFocus
                      onChange={e => setEditLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditingId(null); }}
                    />
                    <button className="hs-btn hs-confirm" onClick={confirmEdit}>✓</button>
                    <button className="hs-btn hs-cancel"  onClick={() => setEditingId(null)}>✕</button>
                  </>
                ) : (
                  <>
                    <span className="hs-label">{h.label}</span>
                    <button className="hs-btn hs-edit"   onClick={() => startEdit(h)}>✎</button>
                    <button className="hs-btn hs-delete" onClick={() => save(habits.filter(x => x.id !== h.id))}>×</button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="hs-add" style={{ marginTop: 16 }}>
            <input ref={addRef} className="hs-input" placeholder="New habit name…"
              value={addLabel} onChange={e => setAddLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addHabit(); }}
            />
            <button className="btn" style={{ padding: '8px 14px', fontSize: 13, whiteSpace: 'nowrap' }}
              onClick={addHabit} disabled={!addLabel.trim()}
            >+ Add</button>
          </div>

          <div style={{
            marginTop: 24, padding: '12px 14px', borderRadius: 10,
            background: 'var(--accent-soft)', border: '1px solid var(--accent-glow)',
            fontSize: 12, lineHeight: 1.6, color: 'var(--mut)',
          }}>
            <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 4 }}>Auto-sync habits</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span><code style={{ fontFamily: 'var(--mono)', color: 'var(--text)', fontSize: 11 }}>Sleep</code> — auto-completes when Garmin shows ≥ 7 hrs sleep for today.</span>
              <span><code style={{ fontFamily: 'var(--mono)', color: 'var(--text)', fontSize: 11 }}>▭ Read</code> — auto-completes when reading progress is logged in the Reading tab today.</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function HabitsDeep() {
  const { setTab }                                                  = useDashboard();
  const { habits, done, history, toggle, setHabits, setDateDone }  = useHabits();
  const { isDemo }                  = useDemo();
  const [showEdit, setShowEdit]     = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [wake, setWake]             = useState<Map<string, string>>(new Map());

  // Wake-up times (date → "HH:MM") for the heatmap tooltip + trend chart.
  useEffect(() => {
    if (isDemo) {
      // Synthetic series so the trend/tooltips aren't empty in demo mode.
      const m = new Map<string, string>();
      const base = new Date(); base.setHours(12, 0, 0, 0);
      for (let i = 0; i < 14; i++) {
        const dt = new Date(base); dt.setDate(base.getDate() - i);
        const mins = 6 * 60 + 15 + Math.round(Math.sin(i * 1.1) * 35); // ~5:40–6:50
        m.set(dateToKey(dt), `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
      }
      setWake(m);
      return;
    }
    let cancelled = false;
    fetch('/api/habits/wake?days=90')
      .then(r => r.json())
      .then(({ logs }: { logs: { date: string; wakeTime: string }[] }) => {
        if (cancelled || !Array.isArray(logs)) return;
        setWake(new Map(logs.map(l => [l.date, l.wakeTime])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isDemo]);

  const panelDone = selectedDate ? (history.get(selectedDate) ?? []) : [];

  const handleDayToggle = (habitId: string) => {
    if (!selectedDate) return;
    const next = panelDone.includes(habitId)
      ? panelDone.filter(id => id !== habitId)
      : [...panelDone, habitId];
    setDateDone(selectedDate, next);
  };

  const today     = localDateKey();
  const last7     = lastNDays(7);
  const calMonths = [0].map(monthOf); // current month only
  const curMonth  = monthOf(0);

  const doneCount  = done.length;
  const total      = habits.length;
  const validIds   = new Set(habits.map(h => h.id));
  const weekTotal  = last7.reduce((s, k) => {
    const logged = history.get(k) ?? [];
    return s + logged.filter(id => validIds.has(id)).length;
  }, 0);
  const weekPoss  = last7.length * total;
  const weekPct   = weekPoss > 0 ? Math.round((weekTotal / weekPoss) * 100) : 0;
  const topStreak = total > 0
    ? Math.max(...habits.map(h => calcStreak(h.id, today, done, history)), 0) : 0;

  // Monthly summary stats — count only current habit IDs
  const curDays       = daysInMonth(curMonth.year, curMonth.month).filter(d => d <= today);
  const perfectThisMo = curDays.filter(d => {
    if (total === 0) return false;
    const logged = history.get(d) ?? [];
    return logged.filter(id => validIds.has(id)).length >= total;
  }).length;
  const monthPct      = monthRate(curMonth.year, curMonth.month, history, habits, today);
  const monthColor    = monthPct >= 80 ? 'var(--ok)' : monthPct >= 50 ? 'var(--warn)' : 'var(--mut)';

  // Previous 30-day window (days 31–60 back) for the trend-vs-prior column
  const prev30 = lastNDays(60).slice(0, 30);
  const habitStats = habits.map(h => {
    const rate     = completionRate(h.id, today, done, history);
    const prevDone = prev30.filter(k => (history.get(k) ?? []).includes(h.id)).length;
    return {
      ...h,
      rate,
      delta:  rate - Math.round((prevDone / prev30.length) * 100),
      streak: calcStreak(h.id, today, done, history),
      last7:  last7.map(k => (history.get(k) ?? []).includes(h.id)),
    };
  });

  return (
    <div className="canvas">
      {showEdit && (
        <EditDrawer habits={habits} setHabits={setHabits} onClose={() => setShowEdit(false)} />
      )}
      {selectedDate && (
        <DayEditPanel
          date={selectedDate}
          habits={habits}
          done={panelDone}
          onToggle={handleDayToggle}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>
        <button
          className="btn ghost"
          style={{ fontSize: 12, padding: '6px 13px' }}
          onClick={() => setShowEdit(true)}
        >✎ Edit habits</button>
      </div>

      <div className="deep-head">
        <div>
          <h1>Habits</h1>
          <div className="sub">
            {total} HABITS · {doneCount}/{total} TODAY · {weekPct}% THIS WEEK · {topStreak}D BEST STREAK
          </div>
        </div>
      </div>

      {/* Monthly summary chips */}
      <div className="chips" style={{ marginBottom: 8 }}>
        <span className="chip">
          <span style={{ marginRight: 5, color: 'var(--ok)' }}>◎</span>
          {perfectThisMo} perfect {perfectThisMo === 1 ? 'day' : 'days'} this month
        </span>
        <span className={`chip${topStreak >= 7 ? ' acc' : ''}`}>
          <span style={{ marginRight: 5 }}>⚡</span>
          {topStreak}d best streak
        </span>
        <span className="chip" style={{ color: monthColor }}>
          {monthPct}% {MONTH_NAMES[curMonth.month].slice(0, 3).toUpperCase()}
        </span>
      </div>

      <div className="stack">
        {/* Row 1: Today · Calendar (this month) · Wake-up */}
        <div className="habits-row3">
          <Panel glyph="◎" title="Today" meta={<span className="pill">{doneCount}/{total}</span>}>
            {total === 0 ? (
              <div className="hm-empty">Press ✎ Edit habits to add some.</div>
            ) : (
              <div style={{
                display: 'grid',
                gridAutoFlow: 'column',
                gridTemplateRows: `repeat(${Math.ceil(total / 2)}, auto)`,
                gap: 6,
              }}>
                {habits.map(h => (
                  <HabitRingBtn
                    key={h.id} habit={h}
                    done={done.includes(h.id)}
                    streak={calcStreak(h.id, today, done, history)}
                    onToggle={() => toggle(h.id)}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            glyph="▦"
            title="Calendar"
            meta={
              <div className="chips" style={{ margin: 0 }}>
                <span className="hm-legend hm-legend-none" />
                <span className="hm-legend hm-legend-partial" />
                <span className="hm-legend hm-legend-full" />
              </div>
            }
          >
            <div className="hm-months-row" style={{ justifyContent: 'center', flex: 1 }}>
              {calMonths.map(({ year, month }) => {
                const rate      = monthRate(year, month, history, habits, today);
                const rateColor = rate >= 80 ? 'var(--ok)' : rate >= 50 ? 'var(--warn)' : 'var(--mut)';
                return (
                  <div key={`${year}-${month}`} className="hm-month-col">
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span className="hm-month-label">{MONTH_NAMES[month].slice(0, 3).toUpperCase()} {year}</span>
                      {rate > 0 && (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, color: rateColor }}>
                          {rate}%
                        </span>
                      )}
                    </div>
                    <HeatmapWithTip year={year} month={month} history={history} habits={habits} today={today} wake={wake} onDayClick={setSelectedDate} />
                  </div>
                );
              })}
            </div>
          </Panel>

          <WakeTimeCard />
        </div>

        {/* Row 2: Completion consistency + wake-up trend, side by side */}
        <div className="two-col">
          <ConsistencyCard history={history} habits={habits} />
          <WakeTrend wake={wake} />
        </div>

        {/* Row 3: Per-habit streaks + weekday rhythm */}
        <div className="two-col">
          <StreaksPanel habits={habits} done={done} history={history} today={today} />
          <RhythmCard history={history} habits={habits} />
        </div>

        {/* Row 4: 7-day dot grid + 30d % */}
        <Panel glyph="★" title="Breakdown" meta={<span className="pill">30 days</span>}>
          {total === 0 ? (
            <div className="hm-empty">No habits configured yet.</div>
          ) : (
            <div>
              <div className="habit-row hbd-header">
                <span />
                <div className="hgrid hbd-dow">
                  {last7.map((k, i) => {
                    const dd = new Date(k + 'T12:00:00');
                    return (
                      <span key={i} className={`hbd-day${k === today ? ' hbd-today' : ''}`}>
                        {DOW[dd.getDay()]}
                      </span>
                    );
                  })}
                </div>
                <span className="fcell" style={{ textAlign: 'right', fontSize: 11 }}>30d % · Δ</span>
              </div>
              {habitStats.map(h => (
                <div key={h.id} className="habit-row">
                  <div className="fperson">
                    <div className="fav" style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
                      {h.label.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="fn">{h.label}</div>
                      <div className="ft">{h.streak}d streak</div>
                    </div>
                  </div>
                  <div className="hgrid">
                    {h.last7.map((v, i) => (
                      <div key={i} className={`hd${v ? ' ok' : ''}`} />
                    ))}
                  </div>
                  <div className="fcell" style={{ textAlign: 'right' }}>
                    <div>{h.rate}%</div>
                    <div style={{
                      fontSize: 9.5, fontFamily: 'var(--mono)', marginTop: 1,
                      color: h.delta > 0 ? 'var(--ok)' : h.delta < 0 ? 'var(--danger)' : 'var(--faint)',
                    }}>
                      {h.delta > 0 ? `▲${h.delta}` : h.delta < 0 ? `▼${-h.delta}` : '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
