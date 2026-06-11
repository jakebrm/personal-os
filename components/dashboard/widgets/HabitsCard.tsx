'use client';
import { Panel } from '../Panel';
import { useHabits, HabitRingBtn, calcStreak } from '../HabitsContext';
import { lastNDays, localDateKey } from '@/lib/habits';

export function HabitsCard({ delay }: { delay?: number }) {
  const { habits, done, history, toggle } = useHabits();

  const today     = localDateKey();
  const doneCount = done.length;
  const total     = habits.length;
  const allDone   = doneCount === total && total > 0;

  // "perfect days" this week (all habits done)
  const last7     = lastNDays(7);
  const perfectDays = last7.filter(k => {
    const d = history.get(k) ?? [];
    return total > 0 && d.length >= total;
  }).length;

  return (
    <Panel
      glyph="◎"
      title="Habits"
      meta={<span className="pill">{doneCount}/{total} today</span>}
      deepTab="habits"
      delay={delay}
    >
      <div className="habits-tap">
        {habits.map(h => (
          <HabitRingBtn
            key={h.id}
            habit={h}
            done={done.includes(h.id)}
            streak={calcStreak(h.id, today, done, history)}
            onToggle={() => toggle(h.id)}
          />
        ))}
      </div>

      <div className="chips">
        {allDone
          ? <span className="chip acc">✓ all habits done today</span>
          : <span className="chip">{perfectDays}/7 perfect days this week</span>
        }
      </div>
    </Panel>
  );
}
