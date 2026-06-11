'use client';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDashboard } from './context';
import { useSettings, BG_IDS } from './SettingsContext';
import { TABS } from './TopRail';
import { CARD_META, REMOVED_CARDS } from './DashboardView';

// Global ⌘K palette + keyboard nav, mounted once in Shell so it works on every
// tab. Also opens via the rail's ⌘K chip (window 'os:kbar' event).

type Action = {
  id: string; glyph: string; label: string; group: string;
  keywords?: string; run: () => void;
};

// Deep views reachable only here — not in the top rail.
const EXTRA_VIEWS: [string, string, string][] = [
  ['agenda', '▦', 'Agenda'], ['finance', '$', 'Finance'], ['stats', '◈', 'Stats'],
  ['weather', '◑', 'Weather'], ['nowplaying', '♫', 'Now Playing'], ['settings', '⚙', 'Settings'],
];

export function CommandPalette() {
  const { tab, setTab } = useDashboard();
  const { theme, setTheme, setBg, hiddenCards, hiddenTabs, toggleCard } = useSettings();
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const [sel, setSel]     = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  const close = useCallback(() => { setOpen(false); setQuery(''); setSel(0); }, []);

  const actions = useMemo<Action[]>(() => {
    const nav: Action[] = [...TABS, ...EXTRA_VIEWS].map(([id, g, label]) => ({
      id: `nav-${id}`, glyph: g, label: `Go to ${label}`, group: 'Navigate',
      keywords: id, run: () => setTab(id),
    }));
    const appearance: Action[] = [
      {
        id: 'theme', glyph: '✦', group: 'Appearance',
        label: theme === 'modern' ? 'Switch to Classic theme' : 'Switch to Modern theme',
        keywords: 'theme style appearance classic modern',
        run: () => setTheme(theme === 'modern' ? 'classic' : 'modern'),
      },
      ...BG_IDS.map(b => ({
        id: `bg-${b}`, glyph: '◍', group: 'Appearance',
        label: `Background: ${b[0].toUpperCase()}${b.slice(1)}`,
        keywords: 'background color ambience wallpaper',
        run: () => setBg(b),
      })),
    ];
    const surprise: Action = {
      id: 'surprise', glyph: '✧', label: 'Surprise me', group: 'Fun', keywords: 'random',
      run: () => {
        const pool = [...TABS.map(t => t[0]), 'stats', 'weather'].filter(t => t !== tab);
        setTab(pool[Math.floor(Math.random() * pool.length)]);
      },
    };
    const cards: Action[] = Object.keys(CARD_META).filter(id => !REMOVED_CARDS.has(id)).map(id => ({
      id: `card-${id}`, glyph: CARD_META[id].glyph, group: 'Dashboard cards',
      label: `${hiddenCards.has(id) ? 'Show' : 'Hide'} ${CARD_META[id].title} card`,
      keywords: 'card widget toggle show hide',
      run: () => toggleCard(id),
    }));
    return [...nav, ...appearance, surprise, ...cards];
  }, [theme, hiddenCards, tab, setTab, setTheme, setBg, toggleCard]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return actions.filter(a => a.group !== 'Dashboard cards');
    const score = (a: Action) => {
      const l = a.label.toLowerCase();
      if (l.startsWith(q)) return 0;
      if (l.split(/\s+/).some(w => w.startsWith(q))) return 1;
      if (l.includes(q)) return 2;
      if ((a.keywords ?? '').includes(q)) return 3;
      return -1;
    };
    return actions
      .map(a => [score(a), a] as const)
      .filter(([s]) => s >= 0)
      .sort((x, y) => x[0] - y[0])
      .map(([, a]) => a);
  }, [actions, q]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => {
    listRef.current?.querySelector('.kbar-item.on')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  // Global keys: ⌘K toggles the palette; [ / ] cycle tabs when not typing.
  useEffect(() => {
    const visTabs = TABS.filter(([id]) => id === 'dashboard' || !hiddenTabs.has(id)).map(([id]) => id);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o); setQuery(''); setSel(0);
        return;
      }
      if (open) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.key === '[' || e.key === ']') {
        const idx  = Math.max(0, visTabs.indexOf(tab));
        const next = e.key === ']'
          ? (idx + 1) % visTabs.length
          : (idx - 1 + visTabs.length) % visTabs.length;
        setTab(visTabs[next]);
      }
    };
    const onOpen = () => { setQuery(''); setSel(0); setOpen(true); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('os:kbar', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('os:kbar', onOpen);
    };
  }, [open, tab, hiddenTabs, setTab]);

  function runAction(a: Action) {
    a.run();
    // Toggles stay open (labels flip in place); navigation closes.
    if (a.id.startsWith('nav-') || a.id === 'surprise') close();
    else inputRef.current?.focus();
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown')    { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter')   { const a = results[sel]; if (a) runAction(a); }
    else if (e.key === 'Escape')  { close(); }
  }

  if (!open) return null;

  return (
    <div className="kbar-overlay" onClick={close}>
      <div className="kbar" onClick={e => e.stopPropagation()}>
        <div className="kbar-input-row">
          <span className="kbar-spark">✦</span>
          <input
            ref={inputRef}
            value={query}
            placeholder="Jump to a view, switch theme, toggle cards…"
            onChange={e => { setQuery(e.target.value); setSel(0); }}
            onKeyDown={onInputKey}
          />
          <kbd className="kbar-esc">esc</kbd>
        </div>
        <div className="kbar-list" ref={listRef}>
          {results.length === 0 && <div className="kbar-empty">Nothing matches &ldquo;{query}&rdquo;</div>}
          {results.map((a, i) => (
            <Fragment key={a.id}>
              {(i === 0 || results[i - 1].group !== a.group) && <div className="kbar-group">{a.group}</div>}
              <button
                type="button"
                className={`kbar-item${i === sel ? ' on' : ''}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => runAction(a)}
              >
                <span className="kbar-glyph">{a.glyph}</span>
                <span className="kbar-label">{a.label}</span>
                {i === sel && <span className="kbar-enter">⏎</span>}
              </button>
            </Fragment>
          ))}
        </div>
        <div className="kbar-foot">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>⏎</kbd> run</span>
          <span><kbd>[</kbd> <kbd>]</kbd> cycle tabs</span>
          <span><kbd>⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
