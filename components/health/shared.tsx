'use client';
export type { WellnessRow, StravaRow, BodyLog, Biomarker, BiomarkerGroup, NutritionLog } from './useHealthData';
export { avg, fmtMin, fmtHrs, sportIcon, sportTab, weeksToRace, RACE_DATE } from './useHealthData';

/* ── Palette — every health visual draws from these tokens ──────────────────── */

export const PAL = {
  accent:  'var(--accent)',   // gold — chrome, highlights, interactive states
  accent2: 'var(--accent2)',
  viz:     'var(--viz)',      // primary — follows the chosen background preset
  ok:      'var(--ok)',
  warn:    'var(--warn)',
  danger:  'var(--danger)',
  faint:   'var(--faint)',
  mut:     'var(--mut)',
};

export const SPORT_COLOR: Record<string, string> = {
  run:   'var(--sport-run)',
  bike:  'var(--sport-bike)',
  swim:  'var(--sport-swim)',
  lift:  'var(--sport-lift)',
  walk:  'var(--sport-walk)',
  other: 'var(--sport-other)',
};

/** Recharts tooltip chrome — one look everywhere */
export const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--bg2)',
  border: '1px solid var(--card-bd)',
  borderRadius: 10,
  fontSize: 12,
  boxShadow: '0 12px 32px rgba(0,0,0,.45)',
};
export const TOOLTIP_LABEL: React.CSSProperties = { color: 'var(--n1)', fontWeight: 600, marginBottom: 4 };
export const TOOLTIP_ITEM:  React.CSSProperties = { color: 'var(--mut)' };

/* ── Card header — matches the dashboard widgets' chead/glyph/ctitle look ───── */

export function CardHead({ icon, title, source, meta, children }: {
  icon: string; title: string; source?: string; meta?: string; children?: React.ReactNode;
}) {
  return (
    <div className="chead">
      <div className="glyph" style={{ color: 'var(--accent)' }}><Icon id={icon} size={16} /></div>
      <div className="ctitle" style={{ fontSize: 17 }}>{title}</div>
      <div className="cmeta">
        {meta && <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{meta}</span>}
        {children}
        {source && <span className="pill">{source}</span>}
      </div>
    </div>
  );
}

/* ── Inner KPI tile — the single box style used inside every card ───────────── */

export function Tile({ label, value, unit, color, sub, style }: {
  label: string; value: string; unit?: string; color?: string; sub?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="hx-tile" style={style}>
      <div className="n" style={{ color: color ?? 'var(--n1)' }}>
        {value}
        {unit && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--faint)', marginLeft: 3 }}>{unit}</span>}
      </div>
      <div className="l">{label}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/* ── Segmented control ───────────────────────────────────────────────────────── */

export function Seg<T extends string | number>({ options, value, onChange, style }: {
  options: { id: T; label: string; icon?: string }[];
  value: T; onChange: (id: T) => void; style?: React.CSSProperties;
}) {
  return (
    <div className="hx-seg" style={style}>
      {options.map(o => (
        <button key={String(o.id)} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.icon && <span style={{ opacity: .8 }}>{o.icon}</span>}{o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Legend ──────────────────────────────────────────────────────────────────── */

export function Legend({ items, style }: {
  items: { color: string; label: string }[]; style?: React.CSSProperties;
}) {
  return (
    <div className="hx-legend" style={style}>
      {items.map(i => (
        <span key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span className="sw" style={{ background: i.color }} />{i.label}
        </span>
      ))}
    </div>
  );
}

export function Sparkline7({ data, h = 30 }: { data: number[]; h?: number }) {
  const valid = data.filter(v => v > 0);
  if (valid.length < 2) return null;
  const w = 120, max = Math.max(...valid), min = Math.min(...valid), rng = (max - min) || 1;
  const pts = valid.map((v, i) =>
    `${(i / (valid.length - 1) * (w - 6) + 3).toFixed(1)},${((1 - (v - min) / rng) * (h - 8) + 4).toFixed(1)}`
  ).join(' ');
  const [lx, ly] = pts.split(' ').pop()!.split(',');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h, display: 'block' }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
      <circle cx={lx} cy={ly} r="2.5" fill="var(--accent)" />
    </svg>
  );
}

export function SparklineBg({ data, color, h = 56, id }: { data: (number | null)[]; color: string; h?: number; id?: string }) {
  const valid = data.filter((v): v is number => v != null);
  if (valid.length < 2) return null;
  const w = 160;
  const min = Math.min(...valid), max = Math.max(...valid), rng = (max - min) || 1;
  const pts = valid.map((v, i) =>
    `${((i / (valid.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 4 - ((v - min) / rng) * (h - 8)).toFixed(1)}`
  );
  const area = `${pts[0]} ${pts.join(' ')} ${(w - 2).toFixed(1)},${h} 2,${h}`;
  const gradId = `spbg-${(id ?? color).replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      style={{ position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', pointerEvents: 'none' }}
      preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.20" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
    </svg>
  );
}

export function Skel({ h = 20, style }: { h?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ height: h, borderRadius: 8, background: 'var(--ph)', animation: 'shimmer 1.4s ease-in-out infinite', ...style }} />
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--faint)', fontSize: 13 }}>
      {text}
    </div>
  );
}

export function Icon({ id, size = 16 }: { id: string; size?: number }) {
  const s = { fill: 'none' as const, stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const icons: Record<string, React.ReactNode> = {
    overview:   <><circle cx="12" cy="12" r="9" {...s}/><circle cx="12" cy="12" r="3.5" {...s}/></>,
    sleep:      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" {...s}/>,
    heart:      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" {...s}/>,
    training:   <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" {...s}/>,
    weight:     <><path d="M6 20h12M3 7h18l-2 13H5L3 7z" {...s}/><path d="M9 7c0-1.66 1.34-3 3-3s3 1.34 3 3" {...s}/></>,
    biomarkers: <><path d="M9 3h6v11l3 6H6l3-6V3z" {...s}/><line x1="6" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth={1.5}/></>,
    nutrition:  <path d="M2 22c0 0 7-8 9-12C13 6 22 2 22 2s-2 10-8 13S2 22 2 22z" {...s}/>,
    sources:    <><polygon points="12 2 2 7 12 12 22 7 12 2" {...s}/><polyline points="2 17 12 22 22 17" {...s}/><polyline points="2 12 12 17 22 12" {...s}/></>,
    back:       <><line x1="19" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth={1.5}/><polyline points="12 19 5 12 12 5" {...s}/></>,
    calendar:   <><rect x="3" y="4" width="18" height="18" rx="3" {...s}/><line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth={1.5}/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth={1.5}/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth={1.5}/></>,
    steps:      <><path d="M4 17l4-12 3 8 3-5 4 9" {...s}/><line x1="2" y1="21" x2="22" y2="21" stroke="currentColor" strokeWidth={1.5}/></>,
    volume:     <><rect x="3" y="12" width="4" height="8" rx="1" {...s}/><rect x="10" y="7" width="4" height="13" rx="1" {...s}/><rect x="17" y="3" width="4" height="17" rx="1" {...s}/></>,
    readiness:  <><path d="M12 3a9 9 0 0 1 9 9" {...s}/><path d="M3 12a9 9 0 0 1 2.64-6.36" {...s}/><path d="M12 21a9 9 0 0 1-9-9" {...s}/><path d="M21 12a9 9 0 0 1-2.64 6.36" {...s}/><circle cx="12" cy="12" r="3" {...s}/></>,
    chat:       <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" {...s}/>,
    effort:     <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" {...s}/>,
    zones:      <><path d="M5 19a9 9 0 1 1 14 0" {...s}/><line x1="12" y1="14" x2="16" y2="9" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"/><circle cx="12" cy="14" r="1.5" {...s}/></>,
    trend:      <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" {...s}/><polyline points="17 6 23 6 23 12" {...s}/></>,
    lift:       <><rect x="1.5" y="9" width="3" height="6" rx="1" {...s}/><rect x="19.5" y="9" width="3" height="6" rx="1" {...s}/><rect x="4.5" y="6.5" width="3.5" height="11" rx="1" {...s}/><rect x="16" y="6.5" width="3.5" height="11" rx="1" {...s}/><line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth={1.5}/></>,
    trophy:     <><path d="M7 4h10v5a5 5 0 0 1-10 0V4z" {...s}/><path d="M7 5H4.5a1 1 0 0 0-1 1c0 2 1.5 3.5 3.5 3.5M17 5h2.5a1 1 0 0 1 1 1c0 2-1.5 3.5-3.5 3.5" {...s}/><line x1="12" y1="14" x2="12" y2="18" stroke="currentColor" strokeWidth={1.5}/><line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"/><path d="M12 18c-2 0-3 1-3 3h6c0-2-1-3-3-3z" {...s}/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
      {icons[id] ?? null}
    </svg>
  );
}
