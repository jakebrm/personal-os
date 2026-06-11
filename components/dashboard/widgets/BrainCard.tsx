'use client';
import { useEffect, useRef, useState } from 'react';
import { Panel } from '../Panel';
import { useDashboard } from '../context';

interface Chunk {
  id: string;
  content: string;
  metadata: { source_type?: string };
  created_at: string;
}

const SRC_ICON: Record<string, string> = {
  capture: '📝', task: '✅', habit: '💪', nutrition: '🍎',
  note: '💬', health: '♡', reading: '▭', agenda: '📅',
  finance: '◆', friends: '❀', goal: '◎',
};

function srcIcon(t?: string) { return t ? (SRC_ICON[t] ?? '🧩') : '🧩'; }

export function BrainCard({ delay }: { delay?: number }) {
  const { setTab } = useDashboard();
  const [total,   setTotal]   = useState<number | null>(null);
  const [recent,  setRecent]  = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/memory/stats').then(r => r.json()),
      fetch('/api/memory/search?limit=3').then(r => r.json()),
    ]).then(([stats, chunks]) => {
      if (!stats.error)                       setTotal(stats.total ?? 0);
      if (!chunks.error && Array.isArray(chunks)) setRecent(chunks.slice(0, 3));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <Panel glyph="◈" title="Brain" meta={
      loading
        ? <span className="pill">…</span>
        : <span className="pill">{total?.toLocaleString() ?? 0} memories</span>
    } deepTab="brain" delay={delay}>

      {/* Quick-search input — opens Brain deep with pre-filled query */}
      <div className="tsk-quickadd" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="hs-input"
          placeholder="Search memory…"
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const q = inputRef.current?.value.trim();
              // Store pending query in sessionStorage, BrainDeep reads it on mount
              if (q) sessionStorage.setItem('brain-init-query', q);
              setTab('brain');
            }
          }}
        />
      </div>

      {/* Recent mini-feed */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[0,1,2].map(i => <div key={i} className="chip" style={{ height: 28, animationName: 'pulse', animationDuration: '1.8s', animationIterationCount: 'infinite' }} />)}
        </div>
      ) : recent.length === 0 ? (
        <div style={{ color: 'var(--mut)', fontSize: 12 }}>No memories yet</div>
      ) : (
        <div>
          {recent.map(chunk => (
            <div key={chunk.id} className="check" style={{ alignItems: 'flex-start', gap: 8, padding: '5px 0' }}>
              <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{srcIcon(chunk.metadata?.source_type)}</span>
              <span style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {chunk.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
