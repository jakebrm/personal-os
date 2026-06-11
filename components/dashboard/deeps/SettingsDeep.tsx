'use client';
import { Panel } from '../Panel';
import { useDashboard } from '../context';
import { useSettings, type Bg } from '../SettingsContext';
import { useDemo } from '../DemoContext';
import { CARD_META, REMOVED_CARDS } from '../DashboardView';
import { TABS } from '../TopRail';

// ── Toggle switch + row ───────────────────────────────────────────────────────

function Switch({ on }: { on: boolean }) {
  return (
    <span style={{
      width: 38, height: 22, borderRadius: 99, padding: 2, flexShrink: 0,
      background: on ? 'var(--accent)' : 'var(--chip-bg)',
      border: '1px solid var(--card-bd)',
      display: 'inline-flex', justifyContent: on ? 'flex-end' : 'flex-start',
      transition: 'background .15s, justify-content .15s',
    }}>
      <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: '.15s' }} />
    </span>
  );
}

function ToggleRow({ glyph, label, on, onToggle, first }: {
  glyph: string; label: string; on: boolean; onToggle: () => void; first?: boolean;
}) {
  return (
    <button onClick={onToggle} type="button"
      style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%',
        background: 'none', cursor: 'pointer', padding: '10px 2px',
        border: 'none', borderTop: first ? 'none' : '1px solid rgba(255,255,255,.06)',
        fontFamily: 'var(--sans)', color: on ? 'var(--text)' : 'var(--mut)',
      }}>
      <span style={{ width: 20, textAlign: 'center', color: 'var(--mut)', fontSize: 14 }}>{glyph}</span>
      <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 500 }}>{label}</span>
      <Switch on={on} />
    </button>
  );
}

function ThemeOption({ glyph, label, desc, on, onSelect, first }: {
  glyph: string; label: string; desc: string; on: boolean; onSelect: () => void; first?: boolean;
}) {
  return (
    <button onClick={onSelect} type="button"
      style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%',
        background: 'none', cursor: 'pointer', padding: '10px 2px',
        border: 'none', borderTop: first ? 'none' : '1px solid rgba(255,255,255,.06)',
        fontFamily: 'var(--sans)', color: on ? 'var(--text)' : 'var(--mut)',
      }}>
      <span style={{ width: 20, textAlign: 'center', color: 'var(--mut)', fontSize: 14 }}>{glyph}</span>
      <span style={{ flex: 1, textAlign: 'left' }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 500 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--mut)', marginTop: 2 }}>{desc}</span>
      </span>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        border: on ? '5px solid var(--accent)' : '2px solid var(--card-bd)',
        background: on ? '#fff' : 'transparent', transition: '.15s',
      }} />
    </button>
  );
}

// Background ambience swatches — previews mirror the palettes in dashboard.css.
const BGS: { id: Bg; label: string; preview: string }[] = [
  { id: 'midnight', label: 'Midnight',
    preview: 'radial-gradient(130% 130% at 25% 10%, oklch(0.52 0.12 255 / .60), transparent 62%), radial-gradient(110% 110% at 85% 85%, oklch(0.56 0.10 75 / .35), transparent 60%), #0e1013' },
  { id: 'ocean', label: 'Ocean',
    preview: 'radial-gradient(130% 130% at 25% 10%, oklch(0.50 0.13 240 / .65), transparent 62%), radial-gradient(110% 110% at 85% 85%, oklch(0.55 0.12 210 / .40), transparent 60%), #080d18' },
  { id: 'aurora', label: 'Aurora',
    preview: 'radial-gradient(130% 130% at 25% 10%, oklch(0.55 0.12 165 / .55), transparent 62%), radial-gradient(110% 110% at 85% 85%, oklch(0.45 0.10 140 / .35), transparent 60%), #070d0b' },
  { id: 'sunset', label: 'Sunset',
    preview: 'radial-gradient(130% 130% at 25% 10%, oklch(0.52 0.13 20 / .55), transparent 62%), radial-gradient(110% 110% at 85% 85%, oklch(0.58 0.11 60 / .40), transparent 60%), #120b0e' },
  { id: 'cloud', label: 'Cloud',
    preview: 'radial-gradient(130% 130% at 25% 10%, oklch(0.80 0.07 255 / .85), transparent 62%), radial-gradient(110% 110% at 85% 85%, oklch(0.82 0.06 225 / .55), transparent 60%), #e7eaf1' },
  { id: 'linen', label: 'Linen',
    preview: 'radial-gradient(130% 130% at 25% 10%, oklch(0.85 0.06 75 / .85), transparent 62%), radial-gradient(110% 110% at 85% 85%, oklch(0.82 0.06 30 / .55), transparent 60%), #efe9df' },
];

function BgSwatch({ label, preview, on, onSelect }: {
  label: string; preview: string; on: boolean; onSelect: () => void;
}) {
  return (
    <button onClick={onSelect} type="button"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        fontFamily: 'var(--sans)',
      }}>
      <span style={{
        width: '100%', height: 44, borderRadius: 11, background: preview,
        border: '1px solid var(--card-bd)',
        outline: on ? '2px solid var(--accent)' : 'none', outlineOffset: 2,
        boxShadow: '0 1px 0 rgba(255,255,255,.10) inset',
        transition: 'outline-color .15s',
      }} />
      <span style={{ fontSize: 11.5, fontWeight: 500, color: on ? 'var(--text)' : 'var(--mut)' }}>
        {label}
      </span>
    </button>
  );
}

const hint: React.CSSProperties = {
  fontSize: 12, color: 'var(--mut)', lineHeight: 1.55, margin: '0 0 8px',
};

// ── Main view ─────────────────────────────────────────────────────────────────

export function SettingsDeep() {
  const { setTab } = useDashboard();
  const { hiddenCards, hiddenTabs, theme, bg, toggleCard, toggleTab, setTheme, setBg } = useSettings();
  const { isDemo, setDemo } = useDemo();

  // Dashboard-eligible cards (everything except the retired ones).
  const cardIds = Object.keys(CARD_META).filter(id => !REMOVED_CARDS.has(id));
  const shownCards = cardIds.filter(id => !hiddenCards.has(id)).length;

  // Tabs (Dashboard always stays; Settings is reachable via the gear).
  const tabRows = TABS.filter(([id]) => id !== 'dashboard');

  return (
    <div className="canvas">
      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>

      <div className="deep-head">
        <div>
          <h1>Settings</h1>
          <div className="sub">Customize what shows up across your OS</div>
        </div>
      </div>

      <div className="two-col">
        {/* Dashboard cards */}
        <div className="stack">
          <Panel glyph="▦" title="Dashboard cards"
            meta={<span className="pill">{shownCards}/{cardIds.length} shown</span>}>
            <p style={hint}>Choose which cards appear on your dashboard. Hidden cards keep their position and reappear where they were when re-enabled.</p>
            {cardIds.map((id, i) => (
              <ToggleRow
                key={id}
                first={i === 0}
                glyph={CARD_META[id].glyph}
                label={CARD_META[id].title}
                on={!hiddenCards.has(id)}
                onToggle={() => toggleCard(id)}
              />
            ))}
          </Panel>
        </div>

        {/* Appearance + tabs + demo */}
        <div className="stack">
          <Panel glyph="✦" title="Appearance"
            meta={<span className="pill">{theme}</span>}>
            <p style={hint}>Pick how the whole OS looks. Switches instantly and sticks across visits.</p>
            <ThemeOption
              first
              glyph="◍"
              label="Classic"
              desc="Glassy cards, ambient glow, grain — the original look"
              on={theme === 'classic'}
              onSelect={() => setTheme('classic')}
            />
            <ThemeOption
              glyph="▢"
              label="Modern"
              desc="Flat minimal dark — solid surfaces, system font, crisp borders"
              on={theme === 'modern'}
              onSelect={() => setTheme('modern')}
            />

            <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 12, marginTop: 2 }}>
              <p style={hint}>Background ambience — sets the base tone and the glow field behind everything. Cloud and Linen flip the whole OS light.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {BGS.map(b => (
                  <BgSwatch
                    key={b.id}
                    label={b.label}
                    preview={b.preview}
                    on={bg === b.id}
                    onSelect={() => setBg(b.id)}
                  />
                ))}
              </div>
            </div>
          </Panel>

          <Panel glyph="☰" title="Navigation tabs">
            <p style={hint}>Show or hide tabs in the top bar. Dashboard and Settings always stay available.</p>
            {tabRows.map(([id, g, label], i) => (
              <ToggleRow
                key={id}
                first={i === 0}
                glyph={g}
                label={label}
                on={!hiddenTabs.has(id)}
                onToggle={() => toggleTab(id)}
              />
            ))}
          </Panel>

          <Panel glyph="◐" title="Demo mode"
            meta={<span className="pill" style={{ opacity: 0.7 }}>{isDemo ? 'on' : 'off'}</span>}>
            <p style={hint}>Preview the app with sample data instead of your real data. Back-burnered for now — kept here if you ever want a demo.</p>
            <ToggleRow first glyph="◐" label="Use demo data" on={isDemo} onToggle={() => setDemo(!isDemo)} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
