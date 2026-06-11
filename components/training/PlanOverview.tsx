'use client';
import { useState } from 'react';
import type { WeekMeta } from './useTrainingData';
import { weekStats, fmtWeekRange } from './useTrainingData';

export function PlanOverview({
  weeks, currentWeek, selectedWeek, onSelectWeek,
}: {
  weeks: WeekMeta[];
  currentWeek: number;
  selectedWeek: number;
  onSelectWeek: (n: number) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section className="card tr-overview">
      <button className="tr-overview-toggle" onClick={() => setOpen(o => !o)}>
        <span className={`tr-caret${open ? ' open' : ''}`}>▾</span>
        Plan Overview
      </button>

      {open && (
        <div className="tr-overview-list">
          {weeks.map(wk => {
            const s = weekStats(wk.workouts);
            const pct = s.sessions ? Math.round((s.done / s.sessions) * 100) : 0;
            return (
              <button
                key={wk.weekNumber}
                className={`tr-ov-row${wk.weekNumber === selectedWeek ? ' sel' : ''}`}
                onClick={() => onSelectWeek(wk.weekNumber)}
              >
                <span className="tr-ov-wk">Wk{wk.weekNumber}</span>
                <span className="tr-ov-phase">{wk.phase}</span>
                <span className="tr-ov-range">{fmtWeekRange(wk.start, wk.end)}</span>
                <span className="tr-ov-miles">{s.miles} mi</span>
                <span className="tr-progress tr-ov-bar">
                  <span className="tr-progress-fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="tr-ov-count">{s.done}/{s.sessions}</span>
                {wk.weekNumber === currentWeek && <span className="tr-ov-now">now</span>}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
