'use client';
import { useState } from 'react';
import type { WorkoutRow as Workout } from './useHealthData';
import { sportTab } from './useHealthData';
import { Skel, CardHead, SPORT_COLOR } from './shared';
import { homeDateStr } from '@/lib/dates';

const SPORT_LABEL: Record<string, string> = {
  run: 'Run', bike: 'Ride', swim: 'Swim', lift: 'Lift', other: 'Other',
};

function sport(type: string) {
  const t = (type ?? '').toLowerCase();
  const tab = t.includes('walk') || t.includes('hike') ? 'walk' : sportTab(t);
  return {
    color: SPORT_COLOR[tab] ?? SPORT_COLOR.other,
    label: t.includes('walk') ? 'Walk' : t.includes('hike') ? 'Hike' : (SPORT_LABEL[tab] ?? type),
  };
}

function fmtDuration(min: number | null): string {
  if (min == null) return '';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}h ${m < 10 ? '0' : ''}${m}m` : `${m}m`;
}

function fmtDist(m: number | null, type: string): string | null {
  if (!m) return null;
  if (/swim/i.test(type)) return `${Math.round(m)}m`;
  return `${(m / 1609.344).toFixed(1)} mi`;
}

type TipState = { date: string; x: number; y: number; above: boolean };

function WorkoutTooltip({ workouts, pos }: { workouts: Workout[]; pos: TipState }) {
  return (
    <div style={{
      position: 'fixed',
      left: pos.x,
      ...(pos.above
        ? { top: pos.y - 12, transform: 'translateX(-50%) translateY(-100%)' }
        : { top: pos.y + 12, transform: 'translateX(-50%)' }
      ),
      zIndex: 9999,
      background: 'var(--bg2)',
      border: '1px solid var(--card-bd)',
      borderRadius: 12,
      padding: '12px 14px',
      minWidth: 210, maxWidth: 300,
      boxShadow: '0 20px 60px rgba(0,0,0,.55)',
      pointerEvents: 'none',
    }}>
      {workouts.map((w, i) => {
        const sp   = sport(w.type);
        const dur  = fmtDuration(w.duration_min);
        const dist = fmtDist(w.distance_m, w.type);
        const stats: { label: string; val: string }[] = [];
        if (dur)        stats.push({ label: 'Time',     val: dur });
        if (dist)       stats.push({ label: 'Distance', val: dist });
        if (w.avg_hr)   stats.push({ label: 'Avg HR',   val: `${Math.round(w.avg_hr)} bpm` });
        if (w.calories) stats.push({ label: 'Calories', val: `${w.calories} kcal` });

        return (
          <div key={w.id} style={{
            borderTop: i > 0 ? '1px solid var(--n4)' : undefined,
            paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0,
          }}>
            {/* Name + type badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: sp.color, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.01em' }}>
                {w.name || sp.label}
              </div>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase',
                color: sp.color, background: `color-mix(in oklch, ${sp.color}, transparent 88%)`,
                border: `1px solid color-mix(in oklch, ${sp.color}, transparent 72%)`,
                borderRadius: 5, padding: '2px 6px', flexShrink: 0,
              }}>
                {sp.label}
              </div>
            </div>

            {/* Stats grid */}
            {stats.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                {stats.map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 9, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600 }}>
                      {s.label}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 1 }}>
                      {s.val}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Props = { workouts: Workout[]; loading: boolean };

export function TodayTraining({ workouts, loading }: Props) {
  const [tip, setTip] = useState<TipState | null>(null);

  const now    = new Date();
  const year   = now.getFullYear();
  const month  = now.getMonth();
  const todayStr  = homeDateStr(now);
  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const byDate = new Map<string, Workout[]>();
  for (const w of workouts) {
    if (!byDate.has(w.date)) byDate.set(w.date, []);
    byDate.get(w.date)!.push(w);
  }

  // Build grid cells — start week on Monday
  const firstDow     = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const startOffset  = (firstDow + 6) % 7;
  const cells: (number | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const tipWorkouts = tip ? (byDate.get(tip.date) ?? []) : [];

  return (
    <>
      <div className="card" style={{ gap: 14 }}>
        <CardHead icon="calendar" title="Training" source="garmin" meta={monthName} />

        {loading ? <Skel h={180} /> : (
          <>
            {/* Day-of-week headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: -8 }}>
              {DOW.map(d => (
                <div key={d} style={{
                  textAlign: 'center', fontSize: 9, letterSpacing: '.07em',
                  textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, paddingBottom: 6,
                }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
              {cells.map((day, i) => {
                if (!day) return <div key={`e-${i}`} style={{ height: 44 }} />;

                const iso         = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayWorkouts = byDate.get(iso) ?? [];
                const isToday     = iso === todayStr;
                const isFuture    = iso > todayStr;
                const hasWorkout  = dayWorkouts.length > 0;
                const isHovered   = tip?.date === iso;

                return (
                  <div
                    key={iso}
                    onMouseEnter={e => {
                      if (!hasWorkout || isFuture) return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const above = rect.bottom > window.innerHeight - 220;
                      setTip({ date: iso, x: rect.left + rect.width / 2, y: above ? rect.top : rect.bottom, above });
                    }}
                    onMouseLeave={() => setTip(null)}
                    style={{
                      height: 44, borderRadius: 9,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 5,
                      cursor: hasWorkout && !isFuture ? 'pointer' : 'default',
                      background: isHovered
                        ? 'var(--chip-bg)'
                        : hasWorkout && !isFuture
                          ? 'var(--ph)'
                          : 'transparent',
                      border: isToday
                        ? '1px solid color-mix(in oklch, var(--accent), transparent 45%)'
                        : '1px solid transparent',
                      transition: 'background .12s',
                    }}
                  >
                    {/* Day number */}
                    <span style={{
                      fontSize: 12, lineHeight: 1, fontFamily: 'var(--mono)',
                      fontWeight: isToday ? 700 : hasWorkout && !isFuture ? 600 : 400,
                      color: isFuture
                        ? 'var(--faint)'
                        : isToday
                          ? 'var(--accent)'
                          : hasWorkout
                            ? 'var(--text)'
                            : 'var(--mut)',
                      opacity: isFuture ? 0.45 : 1,
                    }}>
                      {day}
                    </span>

                    {/* Sport dots */}
                    {hasWorkout && !isFuture && (
                      <div style={{ display: 'flex', gap: 2 }}>
                        {dayWorkouts.slice(0, 3).map((w, j) => (
                          <div
                            key={j}
                            style={{ width: 5, height: 5, borderRadius: '50%', background: sport(w.type).color }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            {workouts.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', paddingTop: 12, borderTop: '1px solid var(--n4)' }}>
                {[...new Map(workouts.map(w => {
                  const sp = sport(w.type);
                  return [sp.label, sp] as const;
                })).values()].map(sp => (
                  <span key={sp.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--faint)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: sp.color, display: 'inline-block' }} />
                    {sp.label}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {tip && tipWorkouts.length > 0 && (
        <WorkoutTooltip workouts={tipWorkouts} pos={tip} />
      )}
    </>
  );
}
