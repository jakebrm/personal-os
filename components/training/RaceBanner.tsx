'use client';
import type { TrainingPlan, TrainingWorkout } from './useTrainingData';
import { daysUntil, fmtDayDate } from './useTrainingData';

export function RaceBanner({ plan, workouts }: { plan: TrainingPlan; workouts: TrainingWorkout[] }) {
  const sessions = workouts.filter(w => w.sport?.toLowerCase() !== 'rest');
  const done     = sessions.filter(w => w.completed).length;
  const total    = sessions.length;
  const pct      = total ? Math.round((done / total) * 100) : 0;

  const days = plan.event_date ? daysUntil(plan.event_date) : null;
  const raceOver = days != null && days < 0;

  const countdown = raceOver
    ? '🏁 Race Complete!'
    : days === 0
      ? 'Race day!'
      : days != null
        ? `${days} day${days !== 1 ? 's' : ''} away`
        : '';

  return (
    <section className="card tr-banner">
      <div className="tr-banner-head">
        <div>
          <h1 className="tr-banner-title">
            <span className="tr-run-glyph" aria-hidden>↗</span>
            {plan.event_name ?? plan.name}
          </h1>
          <div className="tr-banner-sub">
            {plan.goal && <span className="tr-goal">Goal: {plan.goal}</span>}
            {plan.goal && countdown && <span className="tr-dot">•</span>}
            {countdown && (
              <span className={raceOver ? 'tr-race-done' : ''}>{countdown}</span>
            )}
            {plan.event_date && !raceOver && (
              <>
                <span className="tr-dot">•</span>
                <span className="tr-faint">{fmtDayDate(plan.event_date)}</span>
              </>
            )}
          </div>
        </div>
        <div className="tr-banner-pct">
          <div className="tr-banner-pct-n">{pct}%</div>
          <div className="tr-banner-pct-l">{done}/{total} done</div>
        </div>
      </div>

      <div className="tr-progress tr-progress-lg">
        <div className="tr-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}
