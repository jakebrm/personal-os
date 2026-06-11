'use client';
import { Panel } from '../Panel';
import { useGoals } from '../GoalsContext';
import type { GoalPaceStatus } from '@/lib/goals';

const STATUS_COLOR: Record<GoalPaceStatus, string> = {
  on_track:  'var(--ok)',
  at_risk:   'var(--warn)',
  behind:    'var(--danger)',
  completed: 'var(--accent)',
};

export function GoalsCard({ delay }: { delay?: number }) {
  const { goals, loading } = useGoals();

  // Only this month's monthly goals
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const yearOf  = (g: typeof goals[number]) => g.start_date ? new Date(g.start_date + 'T12:00').getFullYear() : null;
  const monthOf = (g: typeof goals[number]) => g.start_date ? new Date(g.start_date + 'T12:00').getMonth() : null;
  const current = goals.filter(g =>
    g.timeframe === 'monthly' && yearOf(g) === y && monthOf(g) === m,
  );

  const active  = current.filter(g => g.pace_status !== 'completed');
  const top3    = active.slice(0, 3);
  const onTrack = current.filter(g => g.pace_status === 'on_track' || g.pace_status === 'completed').length;
  const atRisk  = current.filter(g => g.pace_status === 'at_risk' || g.pace_status === 'behind').length;

  return (
    <Panel
      glyph="◎"
      title="Goals"
      meta={
        loading ? undefined :
        current.length > 0 ? (
          <span className="pill" style={{ color: atRisk > 0 ? 'var(--warn)' : 'var(--ok)' }}>
            {onTrack}/{current.length}
          </span>
        ) : undefined
      }
      deepTab="goals"
      delay={delay}
    >
      {loading ? (
        <div style={{ color: 'var(--faint)', fontSize: 12 }}>Loading…</div>
      ) : current.length === 0 ? (
        <div style={{ color: 'var(--faint)', fontSize: 12, padding: '4px 0' }}>
          No goals for this month yet. Set one →
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {top3.map(g => {
            const pct    = Math.min(100, g.pct);
            const color  = STATUS_COLOR[g.pace_status];
            return (
              <div key={g.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
                    <span style={{ fontSize: 13 }}>{g.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.title}
                    </span>
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color, flexShrink: 0, marginLeft: 6 }}>
                    {pct}%
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`, borderRadius: 4,
                    background: color,
                    transition: 'width .5s cubic-bezier(.22,.61,.36,1)',
                  }} />
                </div>
              </div>
            );
          })}
          {active.length > 3 && (
            <div style={{ fontSize: 11, color: 'var(--mut)', textAlign: 'center', marginTop: 2 }}>
              +{active.length - 3} more
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
