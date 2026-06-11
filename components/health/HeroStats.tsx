'use client';
import type { WellnessRow, StravaRow, WorkoutRow } from './useHealthData';
import { Skel, SparklineBg, PAL } from './shared';

type Props = { wellness: WellnessRow[]; activities: StravaRow[]; workouts: WorkoutRow[]; loading: boolean };

function lastWith(rows: WellnessRow[], key: keyof WellnessRow) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][key] != null) return rows[i];
  }
  return null;
}

function weekStartISO(): string {
  const d = new Date();
  const fromMon = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - fromMon);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtLoad(min: number): string {
  if (min === 0) return '—';
  if (min < 60) return `${Math.round(min)}m`;
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
}

export function HeroStats({ wellness, activities: _activities, workouts, loading }: Props) {
  const w7      = wellness.slice(-7);
  const w30     = wellness.slice(-30);
  const lastVo2 = lastWith(wellness, 'vo2_max');
  const lastHrv = lastWith(wellness, 'hrv');
  const lastRhr = lastWith(wellness, 'resting_hr');
  const todaySteps = wellness.findLast?.((r: WellnessRow) => r.steps != null)?.steps ?? null;

  const weekStart    = weekStartISO();
  const weekW        = workouts.filter(w => w.date >= weekStart);
  const weekCount    = weekW.length;
  const weekLoadMin  = weekW.reduce((s, w) => s + (w.duration_min ?? 0), 0);

  // Compute daily load for last 7 days for sparkline
  const last7Dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const dailyLoad = last7Dates.map(date =>
    workouts.filter(w => w.date === date).reduce((s, w) => s + (w.duration_min ?? 0), 0) || null
  );

  const cards = [
    {
      label: 'VO₂ Max',
      val:   lastVo2?.vo2_max != null ? (lastVo2.vo2_max as number).toFixed(1) : '—',
      unit:  lastVo2?.vo2_max != null ? 'mL/kg' : '',
      color: PAL.viz,
      spark: w30.map((r: WellnessRow) => r.vo2_max),
    },
    {
      label: 'HRV',
      val:   lastHrv?.hrv != null ? String(Math.round(lastHrv.hrv as number)) : '—',
      unit:  lastHrv?.hrv != null ? 'ms' : '',
      color: PAL.ok,
      spark: w7.map((r: WellnessRow) => r.hrv),
    },
    {
      label: 'Resting HR',
      val:   lastRhr?.resting_hr != null ? String(Math.round(lastRhr.resting_hr as number)) : '—',
      unit:  lastRhr?.resting_hr != null ? 'bpm' : '',
      color: PAL.accent2,
      spark: w7.map((r: WellnessRow) => r.resting_hr),
    },
    {
      label: 'Steps Today',
      val:   todaySteps != null ? (todaySteps as number).toLocaleString() : '—',
      unit:  '',
      color: PAL.viz,
      spark: w7.map((r: WellnessRow) => r.steps),
    },
    {
      label: 'Week Workouts',
      val:   String(weekCount),
      unit:  weekCount === 1 ? 'session' : 'sessions',
      color: PAL.accent2,
      spark: last7Dates.map(date => workouts.filter(w => w.date === date).length || null),
    },
    {
      label: 'Weekly Load',
      val:   fmtLoad(weekLoadMin),
      unit:  '',
      color: PAL.ok,
      spark: dailyLoad,
    },
  ];

  if (loading) {
    return (
      <div className="hero-stats" style={{ marginBottom: 0 }}>
        {cards.map(c => <Skel key={c.label} h={88} style={{ borderRadius: 14 }} />)}
      </div>
    );
  }

  return (
    <div className="hero-stats" style={{ marginBottom: 0 }}>
      {cards.map(c => (
        <div key={c.label} className="hx-stat">
          <SparklineBg data={c.spark} color={c.color} id={c.label} />
          <div className="n" style={{ color: c.val !== '—' ? c.color : 'var(--faint)' }}>
            {c.val}
            {c.unit && <small>{c.unit}</small>}
          </div>
          <div className="l">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
