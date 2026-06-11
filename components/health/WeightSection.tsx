'use client';
import { useMemo, useState, useCallback } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { BodyLog, NutritionTargets } from './useHealthData';
import { Skel, EmptyState, CardHead, Seg, Tile, TOOLTIP_STYLE, TOOLTIP_LABEL, TOOLTIP_ITEM, PAL } from './shared';
import { homeDateStr } from '@/lib/dates';

type Props = {
  logs: BodyLog[]; loading: boolean; onAdded: () => void;
  targets?: NutritionTargets | null;
};
type Range = 30 | 60 | 90;

const DAY_MS = 86_400_000;

function shortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** lb/wk corridor for the current goal — the band the 7d avg should live in. */
function goalCorridor(goal: NutritionTargets['goal'] | undefined): { lo: number; hi: number; label: string } {
  if (goal === 'cut')      return { lo: -1.0,  hi: -0.25, label: 'cut −0.25…−1 lb/wk' };
  if (goal === 'maintain') return { lo: -0.25, hi: 0.25,  label: 'maintain ±0.25 lb/wk' };
  return { lo: 0.15, hi: 0.6, label: 'lean bulk +0.15…+0.6 lb/wk' };
}

export function WeightSection({ logs, loading, onAdded, targets }: Props) {
  const [range, setRange]     = useState<Range>(30);
  const [showForm, setForm]   = useState(false);
  const [wt, setWt]           = useState('');
  const [bf, setBf]           = useState('');
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  const save = useCallback(async () => {
    if (!wt) { setErr('Weight is required'); return; }
    setSaving(true); setErr('');
    const res = await fetch('/api/health/weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight_lbs: parseFloat(wt), body_fat_pct: bf ? parseFloat(bf) : null, notes: notes || null }),
    });
    setSaving(false);
    if (res.ok) { setWt(''); setBf(''); setNotes(''); setForm(false); onAdded(); }
    else { const j = await res.json(); setErr(j.error ?? 'Save failed'); }
  }, [wt, bf, notes, onAdded]);

  const goal     = targets?.goal ?? 'lean-bulk';
  const corridor = goalCorridor(goal);

  // ── Per-day series (deduped, real time axis) ───────────────────────────────
  const { days, latest, avgNow, avgWeekAgo, rate, bfLatest } = useMemo(() => {
    // One weight per calendar day — API orders same-day rows oldest→newest, last wins
    const byDate = new Map<string, BodyLog>();
    for (const l of logs) if (l.weight_lbs != null) byDate.set(l.date, l);

    const todayStr = homeDateStr();
    const endMs    = new Date(todayStr + 'T12:00:00').getTime();
    const startMs  = endMs - (range - 1) * DAY_MS;

    type Day = { date: string; t: number; wt: number | null; bf: number | null; avg7: number | null; band: [number, number] | null };
    const days: Day[] = [];
    for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
      const date = homeDateStr(new Date(ms));
      const log  = byDate.get(date);
      days.push({ date, t: ms, wt: log?.weight_lbs ?? null, bf: log?.body_fat_pct ?? null, avg7: null, band: null });
    }

    // Rolling 7-day average over the day grid (only days with weigh-ins count)
    for (let i = 0; i < days.length; i++) {
      const win = days.slice(Math.max(0, i - 6), i + 1).map(d => d.wt).filter((v): v is number => v != null);
      days[i].avg7 = win.length ? +(win.reduce((a, b) => a + b, 0) / win.length).toFixed(2) : null;
    }
    // Carry the avg forward through gaps so the trend line is continuous
    for (let i = 1; i < days.length; i++) {
      if (days[i].avg7 == null) days[i].avg7 = days[i - 1].avg7;
    }

    // Goal corridor: anchored at the first trend point, ±goal-rate per week
    const anchorIdx = days.findIndex(d => d.avg7 != null);
    if (anchorIdx >= 0) {
      const base = days[anchorIdx].avg7!;
      for (let i = anchorIdx; i < days.length; i++) {
        const wk = (i - anchorIdx) / 7;
        days[i].band = [+(base + corridor.lo * wk).toFixed(2), +(base + corridor.hi * wk).toFixed(2)];
      }
    }

    const logged    = days.filter(d => d.wt != null);
    const latest    = logged[logged.length - 1] ?? null;
    const avgNow    = days[days.length - 1]?.avg7 ?? null;
    const weekAgo   = days[days.length - 8]?.avg7 ?? null;
    const rate      = avgNow != null && weekAgo != null ? +(avgNow - weekAgo).toFixed(2) : null;
    const bfLatest  = [...logs].reverse().find(l => l.body_fat_pct != null) ?? null;
    return { days, latest, avgNow, avgWeekAgo: weekAgo, rate, bfLatest };
  }, [logs, range, corridor.lo, corridor.hi]);

  const onPace = rate != null && rate >= corridor.lo && rate <= corridor.hi;
  const paceColor = rate == null ? 'var(--faint)' : onPace ? PAL.ok : PAL.warn;
  const hasAny = days.some(d => d.wt != null);

  return (
    <div className="card" style={{ gap: 16 }}>
      <CardHead icon="weight" title="Weight" source="apple + manual">
        <span className="pill" style={{ color: 'var(--accent2)' }}>{goal.replace('-', ' ')}</span>
        <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px' }}
          onClick={() => setForm(f => !f)}>
          {showForm ? 'Cancel' : '+ Weigh-in'}
        </button>
      </CardHead>

      {/* Manual entry — collapsed by default; the scale syncs via Apple Health */}
      {showForm && (
        <div style={{ background: 'var(--ph)', border: '1px solid var(--ph-bd)', borderRadius: 12, padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="hs-input" placeholder="Weight (lbs)" type="number" step="0.1" value={wt}
            onChange={e => setWt(e.target.value)} style={{ width: 120 }} autoFocus />
          <input className="hs-input" placeholder="Body fat % (opt)" type="number" step="0.1" value={bf}
            onChange={e => setBf(e.target.value)} style={{ width: 140 }} />
          <input className="hs-input" placeholder="Notes (optional)" value={notes}
            onChange={e => setNotes(e.target.value)} style={{ flex: 1, minWidth: 100 }} />
          <button className="btn" onClick={save} disabled={saving}>{saving ? '…' : 'Log'}</button>
          {err && <span style={{ fontSize: 12, color: 'var(--danger)', width: '100%' }}>{err}</span>}
        </div>
      )}

      {loading ? (
        <Skel h={220} />
      ) : !hasAny ? (
        <EmptyState text="No weigh-ins in this window — step on the scale or log one above" />
      ) : (
        <>
          {/* Hero: current weight + pace verdict */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 44, fontWeight: 800, lineHeight: 1, letterSpacing: '-.03em' }}>
                {latest!.wt!.toFixed(1)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>LB</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 4 }}>
              <span className="chip" style={{ color: paceColor, fontFamily: 'var(--mono)', fontSize: 12 }}>
                {rate != null ? `${rate > 0 ? '+' : ''}${rate.toFixed(1)} lb/wk` : '— lb/wk'}
                {rate != null && (onPace ? ' · on pace' : rate > corridor.hi ? ' · hot' : ' · under')}
              </span>
              {avgNow != null && (
                <span className="chip" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>7d avg {avgNow.toFixed(1)}</span>
              )}
              {bfLatest && (
                <span className="chip" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{bfLatest.body_fat_pct!.toFixed(1)}% bf · {shortDate(bfLatest.date)}</span>
              )}
            </div>
          </div>

          {/* Trajectory: goal corridor band + 7d trend + raw weigh-in dots */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600 }}>
              Trajectory · {corridor.label}
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={days} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--n4)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate}
                  tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                  tickLine={false} axisLine={false} interval={range === 30 ? 6 : range === 60 ? 13 : 20} />
                <YAxis domain={['dataMin - 1.5', 'dataMax + 1.5']}
                  tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                  tickLine={false} axisLine={false} width={38}
                  tickFormatter={(v: number) => v.toFixed(0)} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM}
                  labelFormatter={(l) => shortDate(String(l))}
                  formatter={(v, name) => {
                    if (name === 'band') {
                      const [lo, hi] = v as [number, number];
                      return [`${lo}–${hi} lbs`, 'goal corridor'];
                    }
                    return [`${v} lbs`, name === 'wt' ? 'weigh-in' : '7d trend'];
                  }}
                />
                <Area dataKey="band" stroke="none" connectNulls
                  fill="color-mix(in oklch, var(--accent2), transparent 86%)"
                  activeDot={false} name="band" />
                <Line type="monotone" dataKey="avg7" stroke="var(--accent)" dot={false}
                  strokeWidth={2.5} name="avg7" connectNulls />
                <Line dataKey="wt" stroke="none" name="wt" connectNulls={false} isAnimationActive={false}
                  dot={{ r: 3.5, fill: 'var(--viz)', stroke: 'var(--bg)', strokeWidth: 1.5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Range + stats */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <Seg options={([30, 60, 90] as Range[]).map(r => ({ id: r, label: `${r}d` }))}
              value={range} onChange={setRange} />
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>
              {days.filter(d => d.wt != null).length} weigh-ins · band = where the trend should ride
            </span>
          </div>

          <div className="hx-tiles" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <Tile label="latest" value={latest!.wt!.toFixed(1)} unit="lb" sub={shortDate(latest!.date)} />
            <Tile label="7d trend" value={avgNow != null ? avgNow.toFixed(1) : '—'} unit="lb" />
            <Tile label="pace" value={rate != null ? `${rate > 0 ? '+' : ''}${rate.toFixed(1)}` : '—'} unit="lb/wk"
              color={paceColor} sub={onPace ? 'in the corridor' : rate != null ? 'outside corridor' : undefined} />
            <Tile label="vs last week" value={avgWeekAgo != null && avgNow != null ? `${avgNow - avgWeekAgo > 0 ? '+' : ''}${(avgNow - avgWeekAgo).toFixed(1)}` : '—'} unit="lb" />
          </div>
        </>
      )}
    </div>
  );
}
