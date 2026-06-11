'use client';
import { Panel } from '../Panel';
import { useReading } from '../ReadingContext';
import { useHabits, calcStreak } from '../HabitsContext';
import { bookPct } from '@/lib/books';
import { localDateKey } from '@/lib/habits';

export function ReadingCard({ delay }: { delay?: number }) {
  const { books, loading, doneThisYear, goal } = useReading();
  const { done, history } = useHabits();

  const today    = localDateKey();
  const streak   = calcStreak('read', today, done, history);
  const reading  = books.filter(b => b.status === 'reading');
  const queued   = books.filter(b => b.status === 'queued');
  const current  = reading[0] ?? null;
  const pct      = current ? bookPct(current) : 0;

  return (
    <Panel
      glyph="▭"
      title="Reading"
      meta={<span className="pill">{loading ? '…' : `${doneThisYear}/${goal} books`}</span>}
      deepTab="reading"
      delay={delay}
    >
      {loading ? (
        <div style={{ color: 'var(--faint)', fontSize: 12 }}>Loading…</div>
      ) : current ? (
        <div className="rows">
          <div className="row" style={{ flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div className="rt" style={{ flex: 1 }}>{current.title}</div>
              <div className="raside" style={{ flexShrink: 0 }}>{pct}%</div>
            </div>
            {current.author && <div className="rmeta">{current.author}</div>}
            <div className="prog"><i style={{ width: `${pct}%` }} /></div>
            {current.pages && (
              <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>
                {current.pages_read} / {current.pages} pages
              </div>
            )}
          </div>
          {reading.length > 1 && (
            <div className="row">
              <div className="rg">▭</div>
              <div className="rb">
                <div className="rt">{reading[1].title}</div>
                <div className="prog"><i style={{ width: `${bookPct(reading[1])}%` }} /></div>
              </div>
              <div className="raside">{bookPct(reading[1])}%</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ color: 'var(--faint)', fontSize: 12 }}>No book in progress — add one in Reading.</div>
      )}

      <div className="chips">
        {streak > 0
          ? <span className="chip acc">⚡ {streak}d reading streak</span>
          : queued.length > 0
            ? <span className="chip">{queued.length} in queue</span>
            : <span className="chip">▭ open Reading to add books</span>
        }
      </div>
    </Panel>
  );
}
