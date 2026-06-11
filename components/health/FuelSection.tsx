'use client';
import { useEffect, useState } from 'react';
import type { NutritionLog, NutritionTargets, DayType, WorkoutRow } from './useHealthData';
import { sportTab, useNutrition, useNutritionTargets, useWorkouts } from './useHealthData';
import { CardHead, Skel } from './shared';
import { homeDateStr } from '@/lib/dates';

/* ── Fallbacks (used until the nutritionist writes the first weekly row) ────── */

const FALLBACK: Pick<NutritionTargets,
  'goal' | 'protein_g' | 'fat_g' | 'water_ml' |
  'kcal_rest' | 'kcal_lift' | 'kcal_run' | 'kcal_double' |
  'carbs_rest' | 'carbs_lift' | 'carbs_run' | 'carbs_double'
> = {
  goal: 'lean-bulk', protein_g: 180, fat_g: 74, water_ml: 3785,
  kcal_rest: 2360, kcal_lift: 2680, kcal_run: 2800, kcal_double: 3050,
  carbs_rest: 260, carbs_lift: 340, carbs_run: 370, carbs_double: 450,
};

const DT_LABEL: Record<DayType, string> = {
  rest: 'REST DAY', lift: 'LIFT DAY', run: 'ENDURANCE DAY', double: 'DOUBLE DAY',
};
const DT_COLOR: Record<DayType, string> = {
  rest: 'var(--mut)', lift: 'var(--sport-lift)', run: 'var(--sport-run)', double: 'var(--warn)',
};
// The carb dial, straight from the weekly plan
const DT_DIAL: Record<DayType, string> = {
  rest:   '1 cup rice per bowl · 2-3 toast',
  lift:   '1.5 cups rice per bowl · 4 toast',
  run:    '1.5 cups per bowl + extra banana/bar',
  double: '2 cups rice per bowl + bar',
};

/* ── Day-type detection: planned training ∪ what's actually been done ───────── */

/**
 * Planned sessions come from the training plan ('run' | 'strength' | 'race'),
 * done sessions from the workouts table. Per sport we take the larger of
 * planned vs done (so a planned run that's not done yet still counts, and an
 * unplanned second session bumps the day up). 0 → rest, 2+ → double.
 *
 * Same-sport plan items collapse to ONE session — the plan splits a single gym
 * visit into entries like "Pull" + "Core"; only different sports (lift + run)
 * or multiple actual logged activities make a double day.
 */
export function computeDayType(plannedSports: string[], done: WorkoutRow[]): {
  dayType: DayType; sessions: number; detail: string;
} {
  const norm = (s: string) =>
    s === 'strength' ? 'lift' : s === 'race' ? 'run' : sportTab(s);
  const counts: Record<string, { planned: number; done: number }> = {};
  for (const s of plannedSports) {
    const t = norm(s);
    (counts[t] ??= { planned: 0, done: 0 }).planned = 1;
  }
  for (const w of done) {
    if ((w.duration_min ?? 0) < 10) continue;   // ignore micro-activities
    const t = sportTab(w.type);
    if (t === 'other') continue;
    (counts[t] ??= { planned: 0, done: 0 }).done++;
  }

  const tabs = Object.keys(counts);
  const sessions = tabs.reduce((n, t) => n + Math.max(counts[t].planned, counts[t].done), 0);

  let dayType: DayType;
  if (sessions === 0)      dayType = 'rest';
  else if (sessions >= 2)  dayType = 'double';
  else                     dayType = tabs[0] === 'lift' ? 'lift' : 'run';

  const detail = sessions === 0
    ? 'no training today'
    : tabs.map(t => {
        const c = counts[t];
        const label = t === 'lift' ? 'lift' : t;
        return `${label}${Math.max(c.planned, c.done) > 1 ? ' ×2' : ''}${c.done > 0 ? ' ✓' : ''}`;
      }).join(' + ');

  return { dayType, sessions, detail };
}

/** Today's planned sports from the training plan ('run' | 'strength' | ...). */
function usePlannedToday(provided?: string[]) {
  const [sports, setSports] = useState<string[]>(provided ?? []);
  // Depend on a stable key — the caller recreates the array every render
  const providedKey = provided ? provided.join(',') : null;
  useEffect(() => {
    if (providedKey !== null) {
      setSports(providedKey ? providedKey.split(',') : []);
      return;
    }
    const today = homeDateStr();
    fetch('/api/training')
      .then(r => r.ok ? r.json() : { workouts: [] })
      .then((d: { workouts?: { date: string; sport: string }[] }) => {
        setSports((d.workouts ?? [])
          .filter(w => w.date === today && w.sport !== 'rest')
          .map(w => w.sport));
      })
      .catch(() => {});
  }, [providedKey]);
  return sports;
}

/* ── Shared derivation ──────────────────────────────────────────────────────── */

function deriveFuel(targets: NutritionTargets | null, nutLogs: NutritionLog[], doneToday: WorkoutRow[], planned: string[]) {
  const t = targets ?? (FALLBACK as NutritionTargets);
  const { dayType, sessions, detail } = computeDayType(planned, doneToday);
  const kcalTarget  = t[`kcal_${dayType}`];
  const carbsTarget = t[`carbs_${dayType}`]
    ?? Math.round((kcalTarget - t.protein_g * 4 - t.fat_g * 9) / 4);

  const today = homeDateStr();
  const log = nutLogs.find(l => l.date === today) ?? null;
  return { t, dayType, sessions, detail, kcalTarget, carbsTarget, log };
}

function buildDirective(
  dayType: DayType, t: NutritionTargets, log: NutritionLog | null,
  kcalTarget: number,
): { glyph: string; text: string } {
  const eaten      = log?.calories ?? 0;
  const protein    = log?.protein_g ?? 0;
  const proteinGap = Math.round(t.protein_g - protein);
  const kcalLeft   = kcalTarget - eaten;

  if (!log || (!log.calories && !log.protein_g)) {
    return { glyph: '◇', text: `${kcalTarget.toLocaleString()} kcal today — ${DT_DIAL[dayType]}` };
  }
  if (proteinGap > 20) {
    const fix = proteinGap > 45 ? 'a bowl (~52 g) closes it' : 'shake + bar closes it';
    return { glyph: '▲', text: `${proteinGap} g protein to go — ${fix}` };
  }
  if (proteinGap > 0) {
    return { glyph: '▲', text: `${proteinGap} g protein to go — one shake lands it` };
  }
  if (kcalLeft > 150) {
    return { glyph: '✓', text: `protein landed · ${kcalLeft.toLocaleString()} kcal left — carbs are the dial` };
  }
  if (kcalLeft < -200) {
    return dayType === 'double' || dayType === 'run'
      ? { glyph: '✓', text: `+${Math.abs(kcalLeft).toLocaleString()} over — fine, big training day` }
      : { glyph: '◆', text: `+${Math.abs(kcalLeft).toLocaleString()} over target — ease the carb dial tomorrow` };
  }
  return { glyph: '✓', text: 'on target — protein landed, calories square' };
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function Rail({ label, value, target, unit, color }: {
  label: string; value: number; target: number; unit: string; color: string;
}) {
  const pct = Math.min(value / target, 1) * 100;
  const hit = value >= target;
  return (
    <div className={`fuel-rail${hit ? ' hit' : ''}`} style={{ '--rail': color } as React.CSSProperties}>
      <span className="lbl">{label}</span>
      <div className="bar">
        <span className="tick" style={{ left: '25%' }} /><span className="tick" style={{ left: '50%' }} /><span className="tick" style={{ left: '75%' }} />
        <i style={{ width: `${pct}%` }} />
      </div>
      <span className="val"><b>{Math.round(value)}</b> / {target} {unit}</span>
    </div>
  );
}

function WaterCells({ waterMl, targetMl }: { waterMl: number; targetMl: number }) {
  const CELLS = 8;
  const filled = Math.min(CELLS, Math.floor((waterMl / targetMl) * CELLS));
  const oz = Math.round(waterMl / 29.5735), targetOz = Math.round(targetMl / 29.5735);
  return (
    <div className="fuel-water">
      <span className="lbl">WATER</span>
      <div className="fuel-cells">
        {Array.from({ length: CELLS }, (_, i) => (
          <span key={i} className={`fuel-cell${i < filled ? ' on' : ''}`} />
        ))}
      </div>
      <span className="val"><b>{oz}</b> / {targetOz} oz</span>
    </div>
  );
}

/* ── Overview card ──────────────────────────────────────────────────────────── */

export function FuelSection({ nutLogs, workouts, targets, loading }: {
  nutLogs: NutritionLog[];
  workouts: WorkoutRow[];       // done activities (workouts table)
  targets: NutritionTargets | null;
  loading: boolean;
}) {
  const planned = usePlannedToday();
  const today = homeDateStr();
  const doneToday = workouts.filter(w => w.date?.slice(0, 10) === today);

  const { t, dayType, detail, kcalTarget, carbsTarget, log } =
    deriveFuel(targets, nutLogs, doneToday, planned);
  const directive = buildDirective(dayType, t, log, kcalTarget);

  const eaten = log?.calories ?? 0;
  const kcalPct = Math.min(eaten / kcalTarget, 1) * 100;

  return (
    <div className="card fuel-card" style={{ '--fuel-dt': DT_COLOR[dayType] } as React.CSSProperties}>
      <CardHead icon="nutrition" title="Fuel"
        source={targets ? `wk of ${targets.week_start.slice(5).replace('-', '/')}` : 'defaults'}>
        <span className="pill" style={{ color: 'var(--accent2)' }}>{t.goal.replace('-', ' ')}</span>
      </CardHead>

      {loading ? (
        <><Skel h={54} /><Skel h={86} style={{ opacity: .6 }} /></>
      ) : (
        <>
          {/* Day type + adaptive calorie readout */}
          <div className="fuel-top">
            <div>
              <span className="fuel-daytype">{DT_LABEL[dayType]}</span>
              <div className="fuel-detail">{detail}</div>
            </div>
            <div className="fuel-kcal">
              <span className="n">{eaten.toLocaleString()}</span>
              <span className="t">/ {kcalTarget.toLocaleString()}</span>
              <span className="u">KCAL</span>
            </div>
          </div>

          <div className="fuel-reactor">
            <span className="tick" style={{ left: '25%' }} /><span className="tick" style={{ left: '50%' }} /><span className="tick" style={{ left: '75%' }} />
            <i style={{ width: `${kcalPct}%` }} />
          </div>

          {/* Macro rails — protein is the headline */}
          <div className="fuel-rails">
            <Rail label="PROTEIN" value={log?.protein_g ?? 0} target={t.protein_g} unit="g" color="var(--accent2)" />
            <Rail label="CARBS"   value={log?.carbs_g   ?? 0} target={carbsTarget} unit="g" color="var(--ok)" />
            <Rail label="FAT"     value={log?.fat_g     ?? 0} target={t.fat_g}     unit="g" color="var(--warn)" />
          </div>

          <WaterCells waterMl={log?.water_ml ?? 0} targetMl={t.water_ml} />

          <div className="fuel-directive">
            <span className="glyph">{directive.glyph}</span>
            {directive.text}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Compact strip for the Training tab ─────────────────────────────────────── */

export function FuelStrip({ plannedSports }: { plannedSports?: string[] }) {
  const nut  = useNutrition();
  const wo   = useWorkouts();
  const tq   = useNutritionTargets();
  const planned = usePlannedToday(plannedSports);

  const nutLogs  = Array.isArray(nut.data) ? nut.data : [];
  const workouts = Array.isArray(wo.data)  ? wo.data  : [];
  const today    = homeDateStr();
  const doneToday = workouts.filter(w => w.date?.slice(0, 10) === today);

  const { t, dayType, kcalTarget, log } =
    deriveFuel(tq.data?.current ?? null, nutLogs, doneToday, planned);
  const directive = buildDirective(dayType, t, log, kcalTarget);

  if (nut.loading || wo.loading) return null;

  const protein = Math.round(log?.protein_g ?? 0);
  const eaten   = log?.calories ?? 0;

  return (
    <div className="card fuel-strip" style={{ '--fuel-dt': DT_COLOR[dayType] } as React.CSSProperties}>
      <span className="fuel-daytype">{DT_LABEL[dayType]}</span>
      <span className="fs-kcal"><b>{eaten.toLocaleString()}</b> / {kcalTarget.toLocaleString()} kcal</span>
      <span className="fs-rail" style={{ '--rail': 'var(--accent2)' } as React.CSSProperties}>
        <span className="lbl">P</span>
        <span className="bar"><i style={{ width: `${Math.min(protein / t.protein_g, 1) * 100}%` }} /></span>
        <b>{protein}</b>/{t.protein_g}g
      </span>
      <span className="fs-directive">{directive.glyph} {directive.text}</span>
    </div>
  );
}
