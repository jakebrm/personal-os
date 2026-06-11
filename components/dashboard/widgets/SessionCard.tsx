'use client';
import { Panel } from '../Panel';
import { useDashboard } from '../context';
import { useTasks } from '../TasksContext';

export function SessionCard({ delay }: { delay?: number }) {
  const { setTab }  = useDashboard();
  const { tasks, loading } = useTasks();

  const todayOpen = tasks
    .filter(t => t.urgency === 'today' && t.status === 'pending')
    .slice(0, 3);

  return (
    <Panel
      glyph="▣"
      title="Session"
      meta={<span className="pill">{loading ? '…' : `${todayOpen.length} today`}</span>}
      delay={delay}
    >
      {loading ? (
        <div className="sess-skeleton">
          <div className="sess-skel-row" /><div className="sess-skel-row" /><div className="sess-skel-row" />
        </div>
      ) : (
        <div className="rows">
          {todayOpen.map((t, i) => (
            <div
              key={t.id}
              className="row sess-row"
              role="button"
              tabIndex={0}
              onClick={() => setTab('tasks')}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setTab('tasks'); }}
            >
              <div className="rg sess-rank">#{i + 1}</div>
              <div className="rb">
                <div className="rt">{t.title}</div>
                {t.due_date && (
                  <div className="rmeta">{t.due_date}</div>
                )}
              </div>
              <span className="sess-arrow">→</span>
            </div>
          ))}
          {todayOpen.length === 0 && (
            <div className="sess-empty">No open tasks for today</div>
          )}
        </div>
      )}

      <div className="chips">
        <span className="chip acc">☑ {todayOpen.length} open today</span>
        <span className="chip">key · today</span>
      </div>
    </Panel>
  );
}
