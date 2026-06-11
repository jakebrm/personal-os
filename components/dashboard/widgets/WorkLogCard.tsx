'use client';
import { useEffect, useState } from 'react';
import { Panel } from '../Panel';
import { chicagoWeekStart, shiftWeeks } from '@/lib/worklog';
import { formatDuration, hoursLabel, chicagoDayKey, dayLabel, type LearningEntry } from '@/lib/learning';

export function WorkLogCard({ delay }: { delay?: number }) {
  const [entries, setEntries] = useState<LearningEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Pull all logged Agency sessions (from far back) for an all-time total.
    fetch('/api/learning?from=2000-01-01')
      .then(r => (r.ok ? r.json() : { entries: [] }))
      .then(d => setEntries(d.entries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Hours this week (Chicago) and all-time.
  const weekStart = chicagoWeekStart();
  const weekEnd   = shiftWeeks(weekStart, 0, 6);
  const weekMin   = entries.reduce((s, e) => {
    const day = chicagoDayKey(e.started_at);
    return day >= weekStart && day <= weekEnd ? s + e.duration_minutes : s;
  }, 0);
  const totalMin = entries.reduce((s, e) => s + e.duration_minutes, 0);

  // Most recent sessions (entries come back newest-first) for "what I worked on".
  const recent = entries.slice(0, 4);

  return (
    <Panel
      glyph="▤"
      title="Work Log"
      meta={<span className="pill" style={{ fontFamily: 'var(--mono)' }}>{loading ? '…' : `${hoursLabel(totalMin)}h`}</span>}
      deepTab="worklog"
      delay={delay}
    >
      <div>
        {loading && <div className="tsk-loading">Loading…</div>}

        {!loading && entries.length === 0 && (
          <div className="tsk-empty">No Agency hours logged yet</div>
        )}

        {!loading && entries.length > 0 && (
          <>
            <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 8 }}>
              <b style={{ color: 'var(--text)' }}>Agency</b> · {hoursLabel(weekMin)}h this week
            </div>

            {recent.map(e => (
              <div key={e.id} className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.note?.trim() || formatDuration(e.duration_minutes)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--mut)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {formatDuration(e.duration_minutes)} · {dayLabel(e.started_at)}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {!loading && entries.length > 0 && (
        <div className="chips">
          <span className="chip acc">
            View all{entries.length > recent.length ? ` · +${entries.length - recent.length} more` : ''}
          </span>
        </div>
      )}
    </Panel>
  );
}
