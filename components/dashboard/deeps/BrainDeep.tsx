'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel } from '../Panel';
import { useDashboard } from '../context';
import { useDemo } from '../DemoContext';
import { DEMO_CHUNKS, DEMO_BRAIN_STATS } from '@/lib/demoData';

// ── Types ─────────────────────────────────────────────────────────

interface Chunk {
  id: string;
  entity_id: string | null;
  content: string;
  created_at: string;
  metadata: { source_type?: string; source_id?: string };
  similarity: number | null;
}

interface Stats {
  total: number;
  by_source: Record<string, number>;
  oldest: string | null;
  newest: string | null;
}

// ── Source meta ───────────────────────────────────────────────────

const SRC_ICON: Record<string, string> = {
  capture: '📝', task: '✅', habit: '💪', nutrition: '🍎',
  note: '💬', health: '♡', reading: '▭', agenda: '📅',
  finance: '◆', friends: '❀', goal: '◎', decision: '🤔',
  work_log: '▤', learning_log: '◷', vault_note: '◈',
};

const SRC_COLOR: Record<string, string> = {
  capture:   'var(--accent)',
  task:      'var(--ok)',
  habit:     'oklch(0.78 0.22 55)',
  nutrition: 'var(--danger)',
  note:      'oklch(0.65 0.18 230)',
  health:    'oklch(0.74 0.12 175)',
  reading:   'oklch(0.72 0.10 255)',
  finance:   'var(--ok)',
  friends:   'var(--accent2)',
  goal:      'var(--warn)',
  work_log:  'var(--accent)',
  learning_log: 'oklch(0.72 0.14 195)',
  vault_note: 'oklch(0.68 0.10 240)',
};

const ALL_SOURCES = ['capture', 'task', 'note', 'habit', 'nutrition', 'health', 'reading', 'finance', 'friends', 'goal', 'work_log', 'learning_log', 'vault_note'];

function srcIcon(t?: string)  { return t ? (SRC_ICON[t]  ?? '🧩') : '🧩'; }
function srcColor(t?: string) { return t ? (SRC_COLOR[t] ?? 'var(--mut)') : 'var(--mut)'; }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ── Result card ───────────────────────────────────────────────────

function ChunkCard({ chunk, onDelete }: { chunk: Chunk; onDelete?: (id: string) => void }) {
  const src = chunk.metadata?.source_type;
  return (
    <div className="card" style={{ padding: '12px 15px', gap: 8, display: 'flex', flexDirection: 'column', cursor: 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: srcColor(src), padding: '2px 8px', borderRadius: 99,
          background: `${srcColor(src)}18`,
          border: `1px solid ${srcColor(src)}30`,
        }}>
          {srcIcon(src)} {src ?? 'unknown'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: 'var(--mut)', fontFamily: 'var(--mono)' }}>
            {fmtDate(chunk.created_at)}
          </span>
          {onDelete && (
            <button
              onClick={() => onDelete(chunk.id)}
              aria-label="Delete memory"
              style={{
                background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer',
                fontSize: 11, fontWeight: 600, padding: '2px 6px', fontFamily: 'var(--sans)',
              }}>
              Delete
            </button>
          )}
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, margin: 0,
        display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {chunk.content}
      </p>
      {chunk.similarity !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 2, borderRadius: 2, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${Math.round(chunk.similarity * 100)}%`,
              background: chunk.similarity > 0.7 ? 'var(--ok)' : chunk.similarity > 0.5 ? 'var(--warn)' : 'var(--mut)',
              transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--mut)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
            {Math.round(chunk.similarity * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}

// ── Ask panel ─────────────────────────────────────────────────────

function AskPanel() {
  const { isDemo } = useDemo();
  const [question, setQuestion] = useState('');
  const [answer,   setAnswer]   = useState('');
  const [asking,   setAsking]   = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const runAsk = useCallback(async (q: string) => {
    if (!q.trim() || asking) return;
    setAsking(true);
    setAnswer('');
    if (isDemo) {
      await new Promise(r => setTimeout(r, 800));
      setAnswer('Based on your notes and reading, you tend to focus on systems that reduce friction and compound over time. Your most captured themes are Zone 2 training, keystone habits, and first-principles thinking. Notable patterns: you read in the evening, meditate best when paired with exercise, and consistently capture insights after finishing books.');
      setAsking(false);
      return;
    }
    try {
      const res = await fetch('/api/memory/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.trim() }),
      });
      if (!res.body) throw new Error('No stream');
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setAnswer(prev => prev + decoder.decode(value));
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch {
      setAnswer('Error connecting to memory. Try again.');
    } finally {
      setAsking(false);
    }
  }, [asking, isDemo]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="tsk-add-bar">
        <input
          className="hs-input"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Ask anything about your memories…"
          onKeyDown={e => { if (e.key === 'Enter') runAsk(question); }}
          autoFocus
        />
        <button className="btn" style={{ whiteSpace: 'nowrap', fontSize: 13, padding: '8px 16px' }}
          disabled={asking || !question.trim()}
          onClick={() => runAsk(question)}>
          {asking ? '…' : 'Ask'}
        </button>
      </div>

      {(answer || asking) && (
        <div className="card" style={{ padding: '16px 18px' }}>
          {asking && !answer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--mut)', fontSize: 13 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: 'var(--accent)', animation: 'pulse 1.2s ease-in-out infinite' }} />
              Searching memory…
            </div>
          )}
          {answer && (
            <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>
              {answer}
              {asking && <span style={{ display: 'inline-block', width: 2, height: 16, background: 'var(--accent)',
                animation: 'pulse 0.9s ease-in-out infinite', marginLeft: 2, verticalAlign: 'middle' }} />}
            </p>
          )}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}

// ── Search panel ──────────────────────────────────────────────────

function SearchPanel({ initQuery }: { initQuery: string }) {
  const { isDemo } = useDemo();
  const [query,   setQuery]   = useState(initQuery);
  const [results, setResults] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setLoading(true); setError(null);
    if (isDemo) {
      await new Promise(r => setTimeout(r, 200));
      const lq = q.toLowerCase();
      const hits = DEMO_CHUNKS.filter(c => c.content.toLowerCase().includes(lq)).slice(0, 6);
      setResults(hits as unknown as Chunk[]);
      setLoading(false);
      return;
    }
    try {
      const res  = await fetch('/api/memory/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(query), 480);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, runSearch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--mut)', fontSize: 15, pointerEvents: 'none' }}>⌕</span>
        <input
          className="hs-input"
          style={{ paddingLeft: 36 }}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your memory…"
          autoFocus={!initQuery}
        />
        {query && (
          <button onClick={() => setQuery('')}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--mut)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
            ×
          </button>
        )}
      </div>

      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[0,1,2,3].map(i => (
            <div key={i} className="card" style={{ padding: '12px 15px', gap: 8, display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 18, borderRadius: 9, background: 'rgba(255,255,255,.06)', width: '40%' }} />
              <div style={{ height: 13, borderRadius: 4, background: 'rgba(255,255,255,.06)' }} />
              <div style={{ height: 13, borderRadius: 4, background: 'rgba(255,255,255,.06)', width: '75%' }} />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>
      )}

      {!loading && !error && query && results.length === 0 && (
        <p style={{ color: 'var(--mut)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
          No matches — try different keywords
        </p>
      )}

      {!loading && results.length > 0 && (
        <>
          <p style={{ fontSize: 11, color: 'var(--mut)' }}>{results.length} results</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 10 }}>
            {results.map(c => <ChunkCard key={c.id} chunk={c} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ── Recent section ────────────────────────────────────────────────

function RecentSection({ filter }: { filter: string }) {
  const { isDemo } = useDemo();
  const [chunks,  setChunks]  = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(true);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this memory? It will be removed from your brain.')) return;
    if (isDemo) { setChunks(prev => prev.filter(c => c.id !== id)); return; }
    const res = await fetch(`/api/memory?id=${id}`, { method: 'DELETE' });
    if (res.ok) setChunks(prev => prev.filter(c => c.id !== id));
  }, [isDemo]);

  useEffect(() => {
    if (isDemo) {
      const demo = filter === 'all' ? DEMO_CHUNKS : DEMO_CHUNKS.filter(c => c.metadata?.source_type === filter);
      setChunks(demo as unknown as Chunk[]);
      setLoading(false);
      return;
    }
    const params = new URLSearchParams({ limit: '10' });
    if (filter !== 'all') params.set('source_type', filter);
    fetch(`/api/memory/search?${params}`)
      .then(r => r.json())
      .then(d => { if (!d.error && Array.isArray(d)) setChunks(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter, isDemo]);

  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 10 }}>
      {[0,1,2,3,4,5].map(i => (
        <div key={i} className="card" style={{ padding: '12px 15px', gap: 8, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 18, borderRadius: 9, background: 'rgba(255,255,255,.06)', width: '40%' }} />
          <div style={{ height: 13, borderRadius: 4, background: 'rgba(255,255,255,.06)' }} />
          <div style={{ height: 13, borderRadius: 4, background: 'rgba(255,255,255,.06)', width: '75%' }} />
        </div>
      ))}
    </div>
  );

  if (chunks.length === 0) return (
    <p style={{ color: 'var(--mut)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
      No memories yet — start capturing to build your memory layer
    </p>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 10 }}>
      {chunks.map(c => <ChunkCard key={c.id} chunk={c} onDelete={handleDelete} />)}
    </div>
  );
}

// ── Main deep ─────────────────────────────────────────────────────

type Mode = 'search' | 'ask' | 'browse';

export function BrainDeep() {
  const { setTab } = useDashboard();
  const { isDemo } = useDemo();

  const [mode,    setMode]    = useState<Mode>('search');
  const [filter,  setFilter]  = useState('all');
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [initQ,   setInitQ]   = useState('');

  // Pull pre-filled query from BrainCard search
  useEffect(() => {
    const q = sessionStorage.getItem('brain-init-query') ?? '';
    sessionStorage.removeItem('brain-init-query');
    if (q) { setInitQ(q); setMode('search'); }
  }, []);

  useEffect(() => {
    if (isDemo) { setStats(DEMO_BRAIN_STATS); return; }
    fetch('/api/memory/stats')
      .then(r => r.json())
      .then(d => { if (!d.error) setStats(d); })
      .catch(() => {});
  }, [isDemo]);

  const sources = stats ? Object.entries(stats.by_source).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="canvas">
      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>

      {/* Header */}
      <div className="deep-head">
        <div>
          <h1>Brain</h1>
          <div className="sub">
            {stats
              ? `${stats.total.toLocaleString()} memories · ${stats.oldest ? fmtShort(stats.oldest) : '?'} → ${stats.newest ? fmtShort(stats.newest) : '?'}`
              : 'Semantic memory layer'}
          </div>
        </div>
        {/* Source breakdown chips */}
        {sources.length > 0 && (
          <div className="chips" style={{ marginLeft: 'auto' }}>
            {sources.map(([src, count]) => (
              <span key={src} className="chip" style={{ color: srcColor(src) }}>
                {srcIcon(src)} {src} {count}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="scaffold">
        {/* Sidebar */}
        <aside className="card" style={{ gap: 5, alignSelf: 'start', position: 'sticky', top: 100 }}>
          <div className={`snav${mode === 'search' ? ' on' : ''}`} onClick={() => setMode('search')}>
            <span className="g">⌕</span>Search
          </div>
          <div className={`snav${mode === 'ask' ? ' on' : ''}`} onClick={() => setMode('ask')}>
            <span className="g">◈</span>Ask AI
          </div>
          <div className={`snav${mode === 'browse' ? ' on' : ''}`} onClick={() => setMode('browse')}>
            <span className="g">▦</span>Browse
          </div>

          {mode === 'browse' && (
            <>
              <div className="sdiv" />
              <div className={`snav${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
                <span className="g">◎</span>All
                {stats && <span className="tsk-nav-count">{stats.total}</span>}
              </div>
              {ALL_SOURCES.filter(s => stats?.by_source?.[s]).map(s => (
                <div key={s} className={`snav${filter === s ? ' on' : ''}`} onClick={() => setFilter(s)}>
                  <span className="g">{srcIcon(s)}</span>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                  <span className="tsk-nav-count">{stats!.by_source[s]}</span>
                </div>
              ))}
            </>
          )}
        </aside>

        {/* Main */}
        <div className="stack">
          {mode === 'search' && (
            <Panel glyph="⌕" title="Search" meta={<span className="pill">semantic</span>}>
              <SearchPanel initQuery={initQ} />
            </Panel>
          )}

          {mode === 'ask' && (
            <Panel glyph="◈" title="Ask your memory" meta={<span className="pill">AI · streamed</span>}>
              <AskPanel />
            </Panel>
          )}

          {mode === 'browse' && (
            <Panel glyph="▦" title="Recent memories"
              meta={<span className="pill">{filter === 'all' ? 'all sources' : filter}</span>}>
              <RecentSection filter={filter} />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
