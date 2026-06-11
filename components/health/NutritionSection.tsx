'use client';
import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { NutritionLog, NutritionTargets } from './useHealthData';
import { CardHead, Tile, Skel, Legend, TOOLTIP_STYLE, TOOLTIP_LABEL, TOOLTIP_ITEM, PAL } from './shared';
import { homeDateStr } from '@/lib/dates';

type Props = {
  logs: NutritionLog[]; loading: boolean;
  targets?: NutritionTargets | null;
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function MacroRing({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = Math.min(value / target, 1);
  const r = 28, c = 2 * Math.PI * r;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={68} height={68} viewBox="0 0 68 68">
        <circle cx={34} cy={34} r={r} fill="none" stroke="var(--ph)" strokeWidth={5} />
        <circle cx={34} cy={34} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${pct * c} ${c}`} strokeLinecap="round"
          transform="rotate(-90 34 34)" style={{ transition: 'stroke-dasharray .5s ease' }} />
        <text x={34} y={32} textAnchor="middle" fill="var(--text)" fontSize={14} fontWeight={700} fontFamily="var(--sans)">
          {Math.round(value)}
        </text>
        <text x={34} y={44} textAnchor="middle" fill="var(--mut)" fontSize={9} fontFamily="var(--sans)">
          / {target}g
        </text>
      </svg>
      <span style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 600, letterSpacing: '.02em' }}>{label}</span>
    </div>
  );
}

/** Monday of the week containing the date (local string math, TZ-safe). */
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return homeDateStr(d);
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

type WeekAgg = {
  weekStart: string;
  label: string;
  daysLogged: number;
  protein: number | null;   // avg per logged day
  carbs: number | null;
  fat: number | null;
  kcal: number | null;
  proteinHitDays: number;   // days at ≥90% of target
  isCurrent: boolean;
};

function aggregateWeeks(logs: NutritionLog[], proteinTarget: number, weeks = 8): WeekAgg[] {
  const today = homeDateStr();
  const thisMonday = mondayOf(today);

  // Last `weeks` Mondays, oldest first
  const mondays: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisMonday + 'T12:00:00');
    d.setDate(d.getDate() - i * 7);
    mondays.push(homeDateStr(d));
  }

  return mondays.map(ws => {
    const we = (() => { const d = new Date(ws + 'T12:00:00'); d.setDate(d.getDate() + 6); return homeDateStr(d); })();
    const rows = logs.filter(l => l.date >= ws && l.date <= we && ((l.calories ?? 0) > 0 || (l.protein_g ?? 0) > 0));
    const avg = (k: 'protein_g' | 'carbs_g' | 'fat_g' | 'calories') => {
      const vals = rows.map(r => r[k]).filter((v): v is number => v != null && v > 0);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    };
    return {
      weekStart: ws,
      label: shortDate(ws),
      daysLogged: rows.length,
      protein: avg('protein_g'),
      carbs:   avg('carbs_g'),
      fat:     avg('fat_g'),
      kcal:    avg('calories'),
      proteinHitDays: rows.filter(r => (r.protein_g ?? 0) >= proteinTarget * 0.9).length,
      isCurrent: ws === thisMonday,
    };
  });
}

/* ── Main Component ────────────────────────────────────────────────────────── */

export function NutritionSection({ logs, loading: dataLoading, targets }: Props) {
  const today = homeDateStr();
  const todayLog = logs.find(l => l.date === today);

  // Weekly parameters from the nutritionist (nutrition_targets); lift day is
  // the nominal mid-point — the Fuel card carries the day-type-adjusted number.
  const proteinTarget = targets?.protein_g ?? 180;
  const calorieTarget = targets?.kcal_lift ?? 2680;
  const carbsTarget   = targets?.carbs_lift ?? 340;
  const fatTarget     = targets?.fat_g ?? 74;

  const weeks = useMemo(() => aggregateWeeks(logs, proteinTarget), [logs, proteinTarget]);
  const weeksWithData = weeks.filter(w => w.daysLogged > 0);
  const totalLogged   = weeks.reduce((n, w) => n + w.daysLogged, 0);
  const lastFull      = [...weeksWithData].reverse().find(w => !w.isCurrent) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Today ── */}
      <div className="card" style={{ gap: 16 }}>
        <CardHead icon="nutrition" title="Today" source={todayLog?.source ?? 'macrofactor'}>
          <span className="pill" style={{ color: 'var(--accent2)' }}>{(targets?.goal ?? 'lean-bulk').replace('-', ' ')}</span>
        </CardHead>

        {dataLoading ? (
          <Skel h={80} />
        ) : todayLog && (todayLog.calories || todayLog.protein_g) ? (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
            <MacroRing label="PROTEIN" value={todayLog.protein_g ?? 0} target={proteinTarget} color="var(--accent2)" />
            <MacroRing label="CARBS" value={todayLog.carbs_g ?? 0} target={carbsTarget} color="var(--ok)" />
            <MacroRing label="FAT" value={todayLog.fat_g ?? 0} target={fatTarget} color="var(--warn)" />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--sans)', letterSpacing: '-.02em' }}>
                {todayLog.calories ?? 0}
              </span>
              <span style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 600 }}>/ {calorieTarget} kcal</span>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--mut)', fontSize: 13, padding: '8px 0' }}>
            Nothing synced yet today — log meals in MacroFactor and they land here automatically.
          </div>
        )}
      </div>

      {/* ── Weekly fuel report ── */}
      <div className="card" style={{ gap: 16 }}>
        <CardHead icon="volume" title="Weekly Macros" source="macrofactor" meta="8 weeks" />

        {dataLoading ? (
          <Skel h={200} />
        ) : weeksWithData.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '28px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.14em', color: 'var(--accent2)' }}>STANDING BY</div>
            <div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.7, maxWidth: 400 }}>
              This is where your weeks stack up. Log everything in MacroFactor — it syncs
              through Apple Health — and each week fills in with average protein, carbs,
              fat, and how many days you landed {proteinTarget} g protein.
            </div>
          </div>
        ) : (
          <>
            {/* Stacked macro bars + calorie line */}
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={weeks} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
                <CartesianGrid stroke="var(--n4)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                  tickLine={false} axisLine={false} />
                <YAxis yAxisId="g" tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                  tickLine={false} axisLine={false} width={34}
                  label={{ value: 'g/day', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: 'var(--faint)' }, offset: 12 }} />
                <YAxis yAxisId="kcal" orientation="right" tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                  tickLine={false} axisLine={false} width={42} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM}
                  formatter={(v, name) => [
                    name === 'kcal' ? `${v} kcal/day` : `${v} g/day`,
                    String(name),
                  ]}
                />
                <Bar yAxisId="g" dataKey="protein" stackId="m" fill="var(--accent2)" name="protein" radius={[0, 0, 0, 0]} />
                <Bar yAxisId="g" dataKey="carbs"   stackId="m" fill={PAL.ok}   name="carbs" fillOpacity={0.75} />
                <Bar yAxisId="g" dataKey="fat"     stackId="m" fill={PAL.warn} name="fat" fillOpacity={0.75} radius={[3, 3, 0, 0]} />
                <Line yAxisId="kcal" type="monotone" dataKey="kcal" stroke="var(--viz)" strokeWidth={2}
                  dot={{ r: 2.5 }} name="kcal" connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
            <Legend items={[
              { color: 'var(--accent2)', label: 'protein' },
              { color: PAL.ok,   label: 'carbs' },
              { color: PAL.warn, label: 'fat' },
              { color: 'var(--viz)', label: 'calories' },
            ]} />

            {/* Protein adherence per week — the number to defend */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600 }}>
                Protein adherence · days at ≥90% of {proteinTarget} g
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {weeks.map(w => (
                  <div key={w.weekStart} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 110px', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: w.isCurrent ? 'var(--accent)' : 'var(--mut)' }}>
                      {w.label}
                    </span>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {Array.from({ length: 7 }, (_, i) => {
                        const filled = i < w.proteinHitDays;
                        const logged = i < w.daysLogged;
                        return (
                          <span key={i} style={{
                            flex: 1, height: 10, borderRadius: 3,
                            background: filled ? 'var(--accent2)' : logged ? 'color-mix(in oklch, var(--warn), transparent 60%)' : 'var(--ph)',
                            border: '1px solid var(--card-bd)',
                          }} />
                        );
                      })}
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--mut)', textAlign: 'right' }}>
                      {w.daysLogged > 0
                        ? <>{w.protein != null && <b style={{ color: w.protein >= proteinTarget * 0.9 ? 'var(--accent2)' : 'var(--text)' }}>{w.protein}g</b>} · {w.proteinHitDays}/{w.daysLogged}d</>
                        : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="hx-tiles" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <Tile label="days logged" value={String(totalLogged)} sub="last 8 weeks" />
              <Tile label="last full week" value={lastFull?.protein != null ? String(lastFull.protein) : '—'} unit="g protein/day"
                color={lastFull?.protein != null && lastFull.protein >= proteinTarget * 0.9 ? 'var(--accent2)' : undefined} />
              <Tile label="last full week" value={lastFull?.kcal != null ? lastFull.kcal.toLocaleString() : '—'} unit="kcal/day" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
