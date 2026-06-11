'use client';
import type { WeekMeta, TrainingWorkout } from './useTrainingData';
import {
  weekStats, fmtWeekRange, fmtDistance, fmtDuration, sportColor, sportGlyph,
  todayISO, isoAddDaysLocal,
} from './useTrainingData';

// 7 day-columns derived from the week's start date.
function dayColumns(week: WeekMeta): { date: string; workouts: TrainingWorkout[] }[] {
  const cols: { date: string; workouts: TrainingWorkout[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const date = isoAddDaysLocal(week.start, i);
    cols.push({ date, workouts: week.workouts.filter(w => w.date === date) });
  }
  return cols;
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function WorkoutChip({
  w, selected, onSelect,
}: {
  w: TrainingWorkout;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = sportColor(w.sport);
  const dist  = fmtDistance(w.distance_meters);
  const dur   = fmtDuration(w.duration_minutes);
  const metric = dist || dur;

  return (
    <button
      className={`tr-wk${w.completed ? ' done' : ''}${selected ? ' sel' : ''}`}
      style={{ '--sport': color } as React.CSSProperties}
      onClick={onSelect}
    >
      <span className="tr-wk-badge" aria-hidden>{w.completed ? '✓' : sportGlyph(w.sport)}</span>
      <span className="tr-wk-name">{w.name}</span>
      {metric && <span className="tr-wk-metric">{metric}</span>}
      {w.primary_zone && w.primary_zone !== '—' && (
        <span className="tr-wk-zone">{w.primary_zone}</span>
      )}
    </button>
  );
}

export function WeekGrid({
  week, weekIndex, weekCount, selectedId, onSelect, onPrev, onNext,
}: {
  week: WeekMeta;
  weekIndex: number;   // 0-based position among plan weeks
  weekCount: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const stats = weekStats(week.workouts);
  const today = todayISO();
  const cols  = dayColumns(week);

  return (
    <section className="card tr-week">
      {/* Nav + summary */}
      <div className="tr-week-head">
        <button className="tr-nav" onClick={onPrev} disabled={weekIndex === 0} aria-label="Previous week">◀</button>
        <div className="tr-week-title">
          <div className="tr-week-name">
            Week {week.weekNumber} of {weekCount} — {week.phase}
          </div>
          <div className="tr-week-range">{fmtWeekRange(week.start, week.end)}</div>
        </div>
        <button className="tr-nav" onClick={onNext} disabled={weekIndex === weekCount - 1} aria-label="Next week">▶</button>
      </div>

      <div className="tr-week-stats">
        <span><b>{stats.miles}</b> mi</span>
        <span className="tr-dot">•</span>
        <span><b>{stats.hours}</b> hrs</span>
        <span className="tr-dot">•</span>
        <span><b>{stats.sessions}</b> sessions</span>
        <span className="tr-dot">•</span>
        <span><b>{stats.done}/{stats.sessions}</b> done</span>
      </div>

      {/* 7-day grid */}
      <div className="tr-grid">
        {cols.map((col, i) => {
          const isToday = col.date === today;
          return (
            <div key={col.date} className={`tr-day${isToday ? ' today' : ''}`}>
              <div className="tr-day-head">
                <span className="tr-day-dow">{DOW[i]}</span>
                <span className="tr-day-num">{Number(col.date.slice(8, 10))}</span>
              </div>
              <div className="tr-day-body">
                {col.workouts.length === 0 ? (
                  <div className="tr-day-empty">—</div>
                ) : (
                  col.workouts.map(w => {
                    const missed = !w.completed && w.sport?.toLowerCase() !== 'rest' && w.date < today;
                    return (
                      <div key={w.id} className={missed ? 'tr-missed-wrap' : undefined}>
                        <WorkoutChip
                          w={w}
                          selected={w.id === selectedId}
                          onSelect={() => onSelect(w.id)}
                        />
                        {missed && <span className="tr-missed">missed</span>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
