'use client';
import { useEffect, useMemo, useState } from 'react';
import { Panel } from '../Panel';
import { useDashboard } from '../context';

type Bookmark = { id: string; label: string; url: string; cat: string; note?: string };

const CATS = ['Agency', 'Build & AI', 'Daily', 'Finance', 'Training', 'School', 'Markets'] as const;

const CAT_GLYPHS: Record<string, string> = {
  'Agency':   '◆',
  'Build & AI': '⌁',
  'Daily':    '▦',
  'Finance':  '$',
  'Training': '↗',
  'School':   '✎',
  'Markets':  '◈',
};

// Starter examples — edit in the UI (or change this seed list); your changes
// live in localStorage, so this array only matters on first load.
const SEEDS: Bookmark[] = [
  // ── Agency — your business / side-project tools ──
  { id: 'canva',     cat: 'Agency', label: 'Canva',           url: 'https://www.canva.com/' },
  { id: 'gbp',       cat: 'Agency', label: 'Google Business', url: 'https://business.google.com/' },

  // ── Build & AI ──
  { id: 'github',   cat: 'Build & AI', label: 'GitHub',   url: 'https://github.com/' },
  { id: 'vercel',   cat: 'Build & AI', label: 'Vercel',   url: 'https://vercel.com/dashboard' },
  { id: 'supabase', cat: 'Build & AI', label: 'Supabase', url: 'https://supabase.com/dashboard' },
  { id: 'claude',   cat: 'Build & AI', label: 'Claude',   url: 'https://claude.ai/new' },

  // ── Daily ──
  { id: 'gmail',   cat: 'Daily', label: 'Gmail',    url: 'https://mail.google.com/mail/u/0/#inbox' },
  { id: 'gcal',    cat: 'Daily', label: 'Calendar', url: 'https://calendar.google.com/calendar/u/0/r/week' },
  { id: 'youtube', cat: 'Daily', label: 'YouTube',  url: 'https://www.youtube.com/' },

  // ── Finance ──
  { id: 'monarch', cat: 'Finance', label: 'Monarch', url: 'https://app.monarch.com/dashboard', note: 'or your bank of choice' },

  // ── Training ──
  { id: 'intervals', cat: 'Training', label: 'Intervals.icu', url: 'https://intervals.icu/' },
  { id: 'strava',    cat: 'Training', label: 'Strava',        url: 'https://www.strava.com/dashboard' },

  // ── School ──
  { id: 'canvas', cat: 'School', label: 'Canvas', url: 'https://www.instructure.com/canvas/login' },

  // ── Markets ──
  { id: 'marketwatch', cat: 'Markets', label: 'MarketWatch', url: 'https://www.marketwatch.com/investing' },
];

const LS_KEY = 'dashboard-bookmarks-v1';

function loadBookmarks(): Bookmark[] {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (!s) return SEEDS;
    const parsed = JSON.parse(s) as Bookmark[];
    return Array.isArray(parsed) ? parsed : SEEDS;
  } catch {
    return SEEDS;
  }
}

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

// Favicon via Google's s2 service; falls back to a letter tile on error.
function Favicon({ url, label }: { url: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="bm-fav bm-fav-letter">{label[0]?.toUpperCase() ?? '?'}</div>;
  return (
    <img
      className="bm-fav"
      src={`https://www.google.com/s2/favicons?domain=${host(url)}&sz=64`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function BookmarksDeep() {
  const { setTab } = useDashboard();
  const [marks, setMarks] = useState<Bookmark[]>(SEEDS);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ label: '', url: '', cat: 'Agency' as string });

  useEffect(() => { setMarks(loadBookmarks()); }, []);

  function save(next: Bookmark[]) {
    setMarks(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  }

  function addBookmark() {
    const label = draft.label.trim();
    let url = draft.url.trim();
    if (!label || !url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    save([...marks, { id: `u-${Date.now()}`, label, url, cat: draft.cat }]);
    setDraft({ label: '', url: '', cat: draft.cat });
    setAdding(false);
  }

  function removeBookmark(id: string) {
    save(marks.filter(m => m.id !== id));
  }

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => !q ? marks : marks.filter(m =>
      m.label.toLowerCase().includes(q) ||
      host(m.url).toLowerCase().includes(q) ||
      (m.note ?? '').toLowerCase().includes(q)),
    [marks, q],
  );

  // Preserve CATS order, then any user-invented categories
  const cats = [...CATS.filter(c => filtered.some(m => m.cat === c)),
                ...[...new Set(filtered.map(m => m.cat))].filter(c => !(CATS as readonly string[]).includes(c))];

  return (
    <div className="canvas">
      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>

      <div className="deep-head">
        <div>
          <h1>Bookmarks</h1>
          <div className="sub">{marks.length} LINKS · TOOLS, APPS &amp; PLACES YOU ACTUALLY GO</div>
        </div>
        <div className="actions">
          <input
            className="bm-search"
            placeholder="Filter…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button className="btn ghost" onClick={() => setAdding(a => !a)}>
            {adding ? '× Cancel' : '+ Add link'}
          </button>
        </div>
      </div>

      {adding && (
        <div className="bm-add">
          <input
            placeholder="Label"
            value={draft.label}
            autoFocus
            onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') addBookmark(); }}
          />
          <input
            placeholder="URL"
            value={draft.url}
            onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') addBookmark(); }}
          />
          <select value={draft.cat} onChange={e => setDraft(d => ({ ...d, cat: e.target.value }))}>
            {CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn" onClick={addBookmark}>Add</button>
        </div>
      )}

      <div className="stack">
        {cats.map(cat => (
          <Panel key={cat} glyph={CAT_GLYPHS[cat] ?? '⚑'} title={cat}>
            <div className="bm-grid">
              {filtered.filter(m => m.cat === cat).map(m => (
                <a
                  key={m.id}
                  className="bm-tile"
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Favicon url={m.url} label={m.label} />
                  <div className="bm-txt">
                    <div className="bm-label">{m.label}</div>
                    <div className="bm-host">{m.note ?? host(m.url)}</div>
                  </div>
                  <button
                    className="bm-x"
                    aria-label={`Remove ${m.label}`}
                    title="Remove"
                    onClick={e => { e.preventDefault(); e.stopPropagation(); removeBookmark(m.id); }}
                  >
                    ×
                  </button>
                </a>
              ))}
            </div>
          </Panel>
        ))}
        {cats.length === 0 && (
          <div style={{ color: 'var(--faint)', fontSize: 14, padding: '24px 0' }}>
            No links match &ldquo;{query}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
