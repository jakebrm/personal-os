'use client';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import type { WellnessRow, StravaRow } from './useHealthData';
import { fmtMin, avg } from './useHealthData';
import { Skel, EmptyState, CardHead, Tile, TOOLTIP_STYLE, PAL } from './shared';

type Props = { wellness: WellnessRow[]; loading: boolean; activities?: StravaRow[] };

/* ── Sleep payoff: what a good night actually buys you the next day ────────── */

function fmtPace(ms: number): string {
  const minPerMi = 26.8224 / ms;
  return `${Math.floor(minPerMi)}:${String(Math.round((minPerMi % 1) * 60)).padStart(2, '0')}/mi`;
}

function SleepPayoff({ wellness, activities }: { wellness: WellnessRow[]; activities: StravaRow[] }) {
  // Garmin stamps a night's sleep on the wake date, so same-date pairs
  // "after this night's sleep" with that day's body + training.
  const scored = wellness.filter(r => r.sleep_score != null && r.sleep_score > 0);
  const good  = scored.filter(r => r.sleep_score! >= 80);
  const rough = scored.filter(r => r.sleep_score! < 70);
  if (good.length < 3 || rough.length < 3) {
    return (
      <div style={{ fontSize: 11.5, color: 'var(--faint)', lineHeight: 1.6 }}>
        Sleep payoff analysis unlocks once there are 3+ nights both above 80 and below 70 —
        then this section shows what good sleep does to your HRV, resting HR, and run pace the next day.
      </div>
    );
  }

  const actsByDate = new Map<string, StravaRow[]>();
  for (const a of activities) {
    const d = a.date.slice(0, 10);
    (actsByDate.get(d) ?? actsByDate.set(d, []).get(d)!).push(a);
  }

  function bucketStats(rows: WellnessRow[]) {
    const hrv = avg(rows.map(r => r.hrv));
    const rhr = avg(rows.map(r => r.resting_hr));
    const runs = rows.flatMap(r => (actsByDate.get(r.date) ?? [])
      .filter(a => /run/i.test(a.sport_type) && (a.avg_speed_ms ?? 0) > 1));
    const pace = runs.length >= 2 ? avg(runs.map(r => r.avg_speed_ms ?? null)) : null;
    const effort = avg(rows.map(r => {
      const acts = actsByDate.get(r.date) ?? [];
      return acts.length ? acts.reduce((s, a) => s + (a.relative_effort ?? 0), 0) : null;
    }));
    return { hrv, rhr, pace, effort, n: rows.length };
  }

  const g = bucketStats(good), b = bucketStats(rough);

  const rows: { label: string; good: string; rough: string; delta: string; better: boolean }[] = [];
  if (g.hrv && b.hrv) rows.push({
    label: 'next-day HRV', good: `${Math.round(g.hrv)} ms`, rough: `${Math.round(b.hrv)} ms`,
    delta: `${g.hrv >= b.hrv ? '+' : ''}${(((g.hrv - b.hrv) / b.hrv) * 100).toFixed(0)}%`, better: g.hrv >= b.hrv,
  });
  if (g.rhr && b.rhr) rows.push({
    label: 'resting HR', good: `${Math.round(g.rhr)} bpm`, rough: `${Math.round(b.rhr)} bpm`,
    delta: `${g.rhr <= b.rhr ? '' : '+'}${(g.rhr - b.rhr).toFixed(1)} bpm`, better: g.rhr <= b.rhr,
  });
  if (g.pace && b.pace) rows.push({
    label: 'run pace', good: fmtPace(g.pace), rough: fmtPace(b.pace),
    delta: g.pace >= b.pace ? 'faster' : 'slower', better: g.pace >= b.pace,
  });
  if (g.effort != null && b.effort != null && (g.effort > 0 || b.effort > 0)) rows.push({
    label: 'training effort', good: g.effort.toFixed(0), rough: b.effort.toFixed(0),
    delta: `${g.effort >= b.effort ? '+' : ''}${(g.effort - b.effort).toFixed(0)}`, better: g.effort >= b.effort,
  });
  if (!rows.length) return null;

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
        Sleep payoff · days after 80+ nights ({g.n}) vs sub-70 nights ({b.n})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 70px', gap: 8, padding: '4px 10px' }}>
          {['', 'slept 80+', 'sub-70', 'Δ'].map((h, i) => (
            <span key={i} style={{ fontSize: 9.5, fontFamily: 'var(--mono)', letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase', textAlign: i ? 'right' : 'left' }}>{h}</span>
          ))}
        </div>
        {rows.map(r => (
          <div key={r.label} style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 80px 70px', gap: 8,
            padding: '8px 10px', borderTop: '1px solid var(--n4)', alignItems: 'baseline',
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{r.label}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: PAL.ok, textAlign: 'right' }}>{r.good}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mut)', textAlign: 'right' }}>{r.rough}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, textAlign: 'right', color: r.better ? PAL.ok : PAL.warn }}>{r.delta}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 8, lineHeight: 1.5 }}>
        This is your own data arguing for an early night: the 80+ rows are what your body does with real rest.
      </div>
    </div>
  );
}

/* ── 30-night structure: duration + stage mix vs what mattters at 22 ────────── */

function SleepStructure({ wellness }: { wellness: WellnessRow[] }) {
  const nights = wellness.slice(-30).filter(r => (r.sleep_duration_min ?? 0) > 0);
  if (nights.length < 5) return null;

  const dur   = avg(nights.map(r => r.sleep_duration_min));
  const score = avg(nights.map(r => r.sleep_score));
  const withStages = nights.filter(r => (r.sleep_deep_min ?? 0) > 0 || (r.sleep_rem_min ?? 0) > 0);
  const deepPct = withStages.length >= 5
    ? avg(withStages.map(r => (r.sleep_deep_min! / r.sleep_duration_min!) * 100)) : null;
  const remPct = withStages.length >= 5
    ? avg(withStages.map(r => (r.sleep_rem_min! / r.sleep_duration_min!) * 100)) : null;

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
        30-night structure
      </div>
      <div className="hx-tiles" style={{ gridTemplateColumns: `repeat(${deepPct != null ? 4 : 2}, 1fr)` }}>
        <Tile label="avg duration" value={dur != null ? (dur / 60).toFixed(1) : '—'} unit="h"
          color={dur != null ? (dur >= 420 ? PAL.ok : dur >= 360 ? PAL.warn : PAL.danger) : undefined}
          sub="7-9h builds muscle at 22" />
        <Tile label="avg score" value={score != null ? String(Math.round(score)) : '—'}
          color={score != null ? (score >= 80 ? PAL.ok : score >= 60 ? PAL.warn : PAL.danger) : undefined} />
        {deepPct != null && (
          <Tile label="deep sleep" value={deepPct.toFixed(0)} unit="%"
            color={deepPct >= 13 && deepPct <= 23 ? PAL.ok : PAL.warn}
            sub="13-23% — GH + muscle repair" />
        )}
        {remPct != null && (
          <Tile label="REM" value={remPct.toFixed(0)} unit="%"
            color={remPct >= 20 && remPct <= 25 ? PAL.ok : PAL.warn}
            sub="20-25% — skill + memory" />
        )}
      </div>
    </div>
  );
}

function sleepColor(score: number): string {
  if (score >= 80) return PAL.ok;
  if (score >= 60) return PAL.warn;
  if (score > 0)   return PAL.danger;
  return 'var(--ph)';
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function SleepSection({ wellness, loading, activities }: Props) {
  const [selected, setSelected] = useState<WellnessRow | null>(null);
  const last30 = wellness.slice(-30);

  const barData = last30.map(r => ({
    date:   shortDate(r.date),
    full:   r.date,
    score:  r.sleep_score ?? 0,
    dur:    r.sleep_duration_min,
    row:    r,
  }));

  return (
    <div className="card" style={{ gap: 16 }}>
      <CardHead icon="sleep" title="Sleep" source="garmin" meta="30 nights" />

      {loading ? (
        <Skel h={120} />
      ) : last30.length === 0 ? (
        <EmptyState text="No sleep data yet — sync Garmin to see 30 nights" />
      ) : (
        <>
          {/* Last night hero */}
          {(() => {
            const lastSlp = [...last30].reverse().find(r => r.sleep_score != null && r.sleep_score > 0);
            if (!lastSlp) return null;
            const sc = lastSlp.sleep_score!;
            return (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 46, fontWeight: 700, lineHeight: 1, letterSpacing: '-.02em', color: sleepColor(sc) }}>{sc}</div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600 }}>Last night</div>
                  {lastSlp.sleep_duration_min != null && (
                    <div style={{ fontSize: 13, color: 'var(--mut)', marginTop: 2, fontFamily: 'var(--mono)' }}>{fmtMin(lastSlp.sleep_duration_min)}</div>
                  )}
                </div>
              </div>
            );
          })()}

          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={barData} barCategoryGap="18%" margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis domain={[0, 100]} hide />
              <Tooltip
                cursor={{ fill: 'var(--chip-bg)' }}
                content={({ payload }) => {
                  if (!payload?.[0]) return null;
                  const d = payload[0].payload as typeof barData[0];
                  return (
                    <div style={{ ...TOOLTIP_STYLE, padding: '8px 12px' }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.full}</div>
                      <div style={{ color: 'var(--mut)' }}>Score: {d.score > 0 ? d.score : '—'}</div>
                      <div style={{ color: 'var(--mut)' }}>Duration: {d.dur ? fmtMin(d.dur) : '—'}</div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="score"
                radius={[3, 3, 0, 0]}
                onClick={(_data: unknown, index: number) => {
                  const entry = barData[index];
                  if (entry?.score > 0) setSelected(entry.row);
                }}
              >
                {barData.map((d) => (
                  <Cell
                    key={d.full}
                    fill={sleepColor(d.score)}
                    opacity={selected ? (selected.date === d.full ? 1 : 0.45) : 0.85}
                    style={{ cursor: d.score > 0 ? 'pointer' : 'default' }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Detail drawer */}
          {selected && (
            <div style={{
              background: 'var(--ph)', borderRadius: 14, padding: 16,
              border: '1px solid var(--ph-bd)', display: 'flex', flexDirection: 'column', gap: 12,
              animation: 'cardIn .25s cubic-bezier(.22,.61,.36,1) both',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--mono)' }}>{selected.date}</div>
                <span className="chip acc">Score: {selected.sleep_score ?? '—'}</span>
                {selected.sleep_duration_min != null && (
                  <span className="chip">{fmtMin(selected.sleep_duration_min)}</span>
                )}
                <button
                  onClick={() => setSelected(null)}
                  style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--mut)', cursor: 'pointer', fontSize: 16 }}>
                  ×
                </button>
              </div>

              {(selected.sleep_duration_min ?? 0) > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--faint)', marginBottom: 6, letterSpacing: '.05em', textTransform: 'uppercase', fontWeight: 600 }}>
                    Sleep stages · {fmtMin(selected.sleep_duration_min!)}
                  </div>
                  <StageBars row={selected} />
                </div>
              )}

              <div className="hx-tiles" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                {([
                  ['HRV',         selected.hrv != null          ? `${selected.hrv} ms`                     : '—'],
                  ['Resting HR',  selected.resting_hr != null   ? `${selected.resting_hr} bpm`             : '—'],
                  ['SpO₂',        selected.spo2 != null         ? `${selected.spo2}%`                      : '—'],
                  ['Respiration', selected.respiration_rate != null ? `${selected.respiration_rate.toFixed(1)} /min` : '—'],
                  ['Stress',      selected.stress != null       ? String(selected.stress)                   : '—'],
                  ['Body Batt',   selected.body_battery != null ? `${selected.body_battery}%`               : '—'],
                ] as [string, string][]).map(([l, v]) => (
                  <Tile key={l} label={l} value={v} style={{ background: 'var(--chip-bg)' }} />
                ))}
              </div>
            </div>
          )}

          {/* Deeper analytics — only in the full Sleep section (activities provided) */}
          {activities && (
            <>
              <SleepStructure wellness={wellness} />
              <SleepPayoff wellness={wellness} activities={activities} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function StageBars({ row }: { row: WellnessRow }) {
  const total = row.sleep_duration_min ?? 1;
  const stages = [
    { label: 'Deep',  min: row.sleep_deep_min  ?? 0, color: 'var(--viz)' },
    { label: 'REM',   min: row.sleep_rem_min   ?? 0, color: 'var(--sport-bike)' },
    { label: 'Light', min: row.sleep_light_min ?? 0, color: 'var(--n3)' },
    { label: 'Awake', min: row.sleep_awake_min ?? 0, color: 'var(--warn)' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 1 }}>
        {stages.map(s => (
          <div key={s.label} style={{ flex: s.min / total, background: s.color, minWidth: s.min > 0 ? 2 : 0 }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
        {stages.map(s => s.min > 0 && (
          <span key={s.label} style={{ fontSize: 11, color: 'var(--mut)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
            {s.label} {fmtMin(s.min)}
          </span>
        ))}
      </div>
    </div>
  );
}
