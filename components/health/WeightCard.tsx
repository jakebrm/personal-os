'use client';
import type { BodyLog, NutritionTargets } from './useHealthData';
import { avg } from './useHealthData';
import { CardHead, Tile, Skel, SparklineBg, EmptyState } from './shared';
import { homeDateStr } from '@/lib/dates';

/** Avg weight over logs falling in [daysAgoStart, daysAgoEnd) days before today. */
function windowAvg(logs: BodyLog[], daysAgoStart: number, daysAgoEnd: number): number | null {
  const now = new Date(homeDateStr() + 'T12:00:00').getTime();
  const inWin = logs.filter(l => {
    const age = (now - new Date(l.date + 'T12:00:00').getTime()) / 86400_000;
    return age >= daysAgoStart && age < daysAgoEnd;
  });
  return avg(inWin.map(l => l.weight_lbs));
}

function trendStatus(rate: number | null, goal: NutritionTargets['goal'] | undefined) {
  if (rate == null) return { label: 'need more data', color: 'var(--faint)' };
  const g = goal ?? 'lean-bulk';
  if (g === 'lean-bulk') {
    if (rate >= 0.15 && rate <= 0.6) return { label: 'on pace',           color: 'var(--ok)'   };
    if (rate > 0.6)                  return { label: 'gaining fast',      color: 'var(--warn)' };
    if (rate < -0.15)                return { label: 'losing — eat more', color: 'var(--warn)' };
    return                                { label: 'flat',               color: 'var(--mut)'  };
  }
  if (g === 'cut') {
    if (rate <= -0.25 && rate >= -1.25) return { label: 'on pace',      color: 'var(--ok)'   };
    if (rate > 0.15)                    return { label: 'gaining',      color: 'var(--warn)' };
    return                                   { label: 'slow cut',      color: 'var(--mut)'  };
  }
  // maintain
  if (Math.abs(rate) <= 0.3) return { label: 'holding', color: 'var(--ok)' };
  return { label: rate > 0 ? 'drifting up' : 'drifting down', color: 'var(--warn)' };
}

export function WeightCard({ logs, targets, loading }: {
  logs: BodyLog[]; targets: NutritionTargets | null; loading: boolean;
}) {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1] ?? null;

  // Lean-bulk trend: this week's avg vs last week's avg → lb/wk
  const w0 = windowAvg(sorted, 0, 7);
  const w1 = windowAvg(sorted, 7, 14);
  const rate = w0 != null && w1 != null ? w0 - w1 : null;
  const status = trendStatus(rate, targets?.goal);

  const anchor = targets?.weight_lb ?? null;
  const spark = sorted.slice(-30).map(l => l.weight_lbs);
  const latestFat = [...sorted].reverse().find(l => l.body_fat_pct != null)?.body_fat_pct ?? null;

  return (
    <div className="card" style={{ gap: 14 }}>
      <CardHead icon="weight" title="Weight" source={latest?.source ?? undefined}>
        <span className="pill" style={{ color: status.color }}>{status.label}</span>
      </CardHead>

      {loading ? (
        <Skel h={92} />
      ) : !latest ? (
        <EmptyState text="No weigh-ins yet — the scale syncs via Apple Health" />
      ) : (
        <>
          <div className="hx-tiles" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <Tile label="current" value={latest.weight_lbs.toFixed(1)} unit="lb"
              sub={latest.date === homeDateStr() ? 'today' : latest.date.slice(5).replace('-', '/')} />
            <Tile label="7d avg" value={w0 != null ? w0.toFixed(1) : '—'} unit="lb" />
            <Tile label="trend" color={status.color}
              value={rate != null ? `${rate > 0 ? '+' : ''}${rate.toFixed(1)}` : '—'} unit="lb/wk"
              sub={targets ? targets.goal.replace('-', ' ') : undefined} />
            <Tile label="body fat" value={latestFat != null ? latestFat.toFixed(1) : '—'} unit="%" />
          </div>

          <div style={{ position: 'relative', height: 56 }}>
            <SparklineBg data={spark} color="var(--accent)" h={56} id="weightcard" />
            {anchor != null && (
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 0,
                fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--faint)',
                letterSpacing: '.08em',
              }}>
                ANCHOR {anchor} LB
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
