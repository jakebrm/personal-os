'use client';
import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { StravaRow, HrZone } from './useHealthData';
import { sportIcon, sportTab, hrZoneIndex } from './useHealthData';
import { Skel, EmptyState, CardHead, Tile, Seg, TOOLTIP_STYLE, TOOLTIP_LABEL, TOOLTIP_ITEM, PAL, SPORT_COLOR } from './shared';

type Tab = 'run' | 'bike' | 'swim' | 'lift' | 'other';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'run',   label: 'Run',   icon: '↗' },
  { id: 'bike',  label: 'Bike',  icon: '◎' },
  { id: 'swim',  label: 'Swim',  icon: '≈' },
  { id: 'lift',  label: 'Lift',  icon: '◰' },
  { id: 'other', label: 'Other', icon: '◇' },
];

// ── Formatters ────────────────────────────────────────────────────────────────

const M_PER_MI = 1609.344;

function fmtDist(m: number, tab: Tab): string {
  if (tab === 'swim') return m < 1000 ? `${m.toFixed(0)} m` : `${(m / 1000).toFixed(2)} km`;
  return `${(m / M_PER_MI).toFixed(1)} mi`;
}

function fmtPace(distM: number, secs: number): string {
  const spm = secs / (distM / M_PER_MI);
  return `${Math.floor(spm / 60)}:${String(Math.round(spm % 60)).padStart(2, '0')} /mi`;
}

function fmtSpeed(distM: number, secs: number): string {
  return `${((distM / secs) * 2.23694).toFixed(1)} mph`;
}

function fmtDur(secs: number): string {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDurLong(secs: number): string {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60),
    s = secs % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

function fmtDate(iso: string): string {
  return iso.slice(5).replace('-', '/');
}

function getWeekLabel(date: Date): string {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

function thisMonthPrefix(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

// ── HR effort zone ────────────────────────────────────────────────────────────

function effortZone(avgHr: number | null, maxHrAll: number, zones?: HrZone[] | null): string | null {
  if (!avgHr) return null;
  // Real Strava zone boundaries when available; max-HR% estimate otherwise
  if (zones && zones.length >= 3) return `Zone ${hrZoneIndex(avgHr, zones)}`;
  const pct = avgHr / maxHrAll;
  if (pct >= 0.9) return 'Zone 5';
  if (pct >= 0.8) return 'Zone 4';
  if (pct >= 0.7) return 'Zone 3';
  if (pct >= 0.6) return 'Zone 2';
  return 'Zone 1';
}

// Easy → hard runs background-primary through the warm end of the palette
const ZONE_COLORS: Record<string, string> = {
  'Zone 1': PAL.viz,
  'Zone 2': PAL.ok,
  'Zone 3': PAL.accent2,
  'Zone 4': 'oklch(0.72 0.13 50)',
  'Zone 5': PAL.danger,
};

// ── Per-tab summaries ─────────────────────────────────────────────────────────

function monthSummary(acts: StravaRow[]) {
  const pfx  = thisMonthPrefix();
  const month = acts.filter(a => a.date.startsWith(pfx));
  const n     = month.length;
  if (!n) return null;

  const totalDistM = month.reduce((s, a) => s + (a.distance_m || 0), 0);
  const totalSecs  = month.reduce((s, a) => s + a.duration_sec, 0);
  const avgDurSecs = Math.round(totalSecs / n);

  const hrVals   = month.filter(a => a.avg_hr).map(a => a.avg_hr as number);
  const avgHr    = hrVals.length ? Math.round(hrVals.reduce((a, b) => a + b, 0) / hrVals.length) : null;
  const calVals  = month.filter(a => a.calories).map(a => a.calories as number);
  const totalCal = calVals.reduce((a, b) => a + b, 0);

  return { n, totalDistM, totalSecs, avgDurSecs, avgHr, totalCal };
}

// ── Averages across all activities for vs-avg comparison ─────────────────────

function tabAverages(acts: StravaRow[]) {
  const withDist = acts.filter(a => a.distance_m > 0 && a.duration_sec > 0);
  const avgDistM = withDist.length
    ? withDist.reduce((s, a) => s + a.distance_m, 0) / withDist.length : 0;
  const avgSecs = acts.length
    ? acts.reduce((s, a) => s + a.duration_sec, 0) / acts.length : 0;
  const hrVals  = acts.filter(a => a.avg_hr).map(a => a.avg_hr as number);
  const avgHr   = hrVals.length ? hrVals.reduce((a, b) => a + b, 0) / hrVals.length : null;
  const elevVals = acts.filter(a => a.elevation_m > 0).map(a => a.elevation_m);
  const avgElev = elevVals.length ? elevVals.reduce((a, b) => a + b, 0) / elevVals.length : 0;
  return { avgDistM, avgSecs, avgHr, avgElev };
}

// ── Personal records ──────────────────────────────────────────────────────────

type BikePR = { type: 'longest' | 'fastest'; val: string; date: string; name: string } | null;

// Each run credits ONLY its nearest race distance (log-midpoint boundaries),
// so one fast long run can't sweep every tile — avg pace over 6 mi is not a
// "fastest mile". Without per-split data this is the honest version of PRs.
const RUN_CLASSES = [
  { label: 'Fastest ~1 mi run',  ref: 1609 },
  { label: 'Fastest ~5K run',    ref: 5000 },
  { label: 'Fastest ~10K run',   ref: 10000 },
  { label: 'Fastest half+ run',  ref: 21097 },
];

function runPRs(acts: StravaRow[]): { label: string; value: string; meta: string }[] {
  const runs = acts.filter(a => sportTab(a.sport_type) === 'run' && a.distance_m >= 1200 && a.duration_sec > 0);

  const best = new Map<number, StravaRow>(); // class index → fastest avg-pace run
  for (const a of runs) {
    let ci = 0;
    for (let i = 1; i < RUN_CLASSES.length; i++) {
      if (a.distance_m >= Math.sqrt(RUN_CLASSES[i - 1].ref * RUN_CLASSES[i].ref)) ci = i;
    }
    const cur = best.get(ci);
    if (!cur || a.duration_sec / a.distance_m < cur.duration_sec / cur.distance_m) best.set(ci, a);
  }

  return [...best.entries()].sort((x, y) => x[0] - y[0]).map(([ci, a]) => ({
    label: RUN_CLASSES[ci].label,
    value: fmtPace(a.distance_m, a.duration_sec),
    meta:  `${(a.distance_m / M_PER_MI).toFixed(1)} mi · ${a.name.length > 18 ? a.name.slice(0, 15) + '…' : a.name} · ${fmtDate(a.date)}`,
  }));
}

function bikePRs(acts: StravaRow[]): { longest: BikePR; fastest: BikePR } {
  const rides = acts.filter(a => sportTab(a.sport_type) === 'bike' && a.distance_m > 0 && a.duration_sec > 0);
  if (!rides.length) return { longest: null, fastest: null };

  const byDist  = [...rides].sort((a, b) => b.distance_m - a.distance_m)[0];
  const bySpeed = [...rides].sort((a, b) =>
    (b.distance_m / b.duration_sec) - (a.distance_m / a.duration_sec))[0];

  return {
    longest: { type: 'longest', val: `${(byDist.distance_m / M_PER_MI).toFixed(1)} mi`, date: fmtDate(byDist.date), name: byDist.name },
    fastest: { type: 'fastest', val: fmtSpeed(bySpeed.distance_m, bySpeed.duration_sec), date: fmtDate(bySpeed.date), name: bySpeed.name },
  };
}

// ── Weekday consistency (Lift) ────────────────────────────────────────────────

const WDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function weekdayFreq(acts: StravaRow[]) {
  const counts = new Array(7).fill(0);
  acts.forEach(a => {
    const d = new Date(a.date + 'T12:00:00');
    const dow = d.getDay();
    // Shift so Mon=0 … Sun=6
    counts[(dow + 6) % 7]++;
  });
  const max = Math.max(...counts, 1);
  return WDAY_LABELS.map((label, i) => ({ label, count: counts[i], pct: counts[i] / max }));
}

// ── 12-week volume data ───────────────────────────────────────────────────────

function buildVolData(acts: StravaRow[], tab: Tab) {
  const weekMap: Record<string, number> = {};
  acts.forEach(a => {
    const wk = getWeekLabel(new Date(a.date + 'T12:00:00'));
    weekMap[wk] = (weekMap[wk] ?? 0) + (tab === 'lift' ? a.duration_sec / 60 : a.distance_m / M_PER_MI);
  });
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (11 - i) * 7);
    const wk = getWeekLabel(d);
    return { wk: wk.slice(5).replace('-', '/'), val: +(weekMap[wk] ?? 0).toFixed(1) };
  });
}

// ── Delta helper ─────────────────────────────────────────────────────────────

function delta(val: number, avg: number, lowerIsBetter = false): { txt: string; color: string } {
  if (!avg || avg === 0) return { txt: '', color: 'var(--faint)' };
  const diff = val - avg;
  const pct  = Math.round((diff / avg) * 100);
  const sign = diff >= 0 ? '+' : '';
  const better = lowerIsBetter ? diff <= 0 : diff >= 0;
  return {
    txt:   `${sign}${pct}% vs avg`,
    color: better ? PAL.ok : PAL.danger,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ acts, tab }: { acts: StravaRow[]; tab: Tab }) {
  const s = monthSummary(acts);
  if (!s) return null;

  const isLift = tab === 'lift';
  const items: { label: string; val: string }[] = isLift
    ? [
        { label: 'Sessions',   val: String(s.n) },
        { label: 'Total time', val: fmtDur(s.totalSecs) },
        { label: 'Avg HR',     val: s.avgHr ? `${s.avgHr} bpm` : '—' },
        { label: 'Calories',   val: s.totalCal > 0 ? `${s.totalCal.toLocaleString()} kcal` : '—' },
      ]
    : [
        { label: 'Sessions',    val: String(s.n) },
        { label: 'Distance',    val: fmtDist(s.totalDistM, tab) },
        { label: 'Total time',  val: fmtDur(s.totalSecs) },
        { label: 'Avg duration',val: fmtDur(s.avgDurSecs) },
        { label: 'Avg HR',      val: s.avgHr ? `${s.avgHr} bpm` : '—' },
      ];

  const now = new Date();
  const mo  = now.toLocaleString('en-US', { month: 'short' });

  return (
    <div style={{
      display: 'flex', gap: 16, flexWrap: 'wrap', padding: '12px 14px',
      background: 'var(--ph)', borderRadius: 12, border: '1px solid var(--ph-bd)',
      alignItems: 'center',
    }}>
      <div style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase',
        letterSpacing: '.06em', fontWeight: 600, marginRight: 2 }}>
        {mo}
      </div>
      {items.map(it => (
        <div key={it.label} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 70 }}>
          <div style={{ fontSize: 10, color: 'var(--faint)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
            {it.label}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700 }}>
            {it.val}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExpandedRow({ activity, avgs, tab, maxHrAll, zones }: {
  activity: StravaRow;
  avgs: ReturnType<typeof tabAverages>;
  tab: Tab;
  maxHrAll: number;
  zones?: HrZone[] | null;
}) {
  const a          = activity;
  const hasDist    = a.distance_m > 0 && a.duration_sec > 0;
  const isRun      = tab === 'run' || tab === 'swim';
  const zone       = effortZone(a.avg_hr, maxHrAll, zones);
  const dDelta     = hasDist ? delta(a.distance_m, avgs.avgDistM) : null;
  const durDelta   = delta(a.duration_sec, avgs.avgSecs, false);
  const hrDelta    = a.avg_hr && avgs.avgHr ? delta(a.avg_hr, avgs.avgHr, true) : null;

  const stats: { label: string; val: string; color?: string }[] = [
    ...(hasDist ? [{ label: isRun ? 'Pace' : 'Speed', val: isRun ? fmtPace(a.distance_m, a.duration_sec) : fmtSpeed(a.distance_m, a.duration_sec) }] : []),
    { label: 'Duration', val: fmtDurLong(a.duration_sec) },
    ...(a.avg_hr ? [{ label: 'Avg HR', val: `${a.avg_hr} bpm` }] : []),
    ...(a.max_hr ? [{ label: 'Max HR', val: `${a.max_hr} bpm` }] : []),
    ...(a.calories ? [{ label: 'Calories', val: `${a.calories} kcal` }] : []),
    ...(a.elevation_m > 0 ? [{ label: 'Elevation', val: `${a.elevation_m.toFixed(0)} m` }] : []),
    ...(a.relative_effort ? [{ label: 'Rel. effort', val: String(Math.round(a.relative_effort)) }] : []),
    ...(a.avg_cadence ? [{ label: 'Cadence', val: `${Math.round(a.avg_cadence)} spm` }] : []),
    ...(zone ? [{ label: 'Effort', val: zone, color: ZONE_COLORS[zone] }] : []),
  ];

  const comparisons: { label: string; txt: string; color: string }[] = [
    ...(dDelta?.txt ? [{ label: 'Distance', ...dDelta }] : []),
    ...(durDelta.txt ? [{ label: 'Duration', ...durDelta }] : []),
    ...(hrDelta?.txt ? [{ label: 'Avg HR', ...hrDelta }] : []),
  ];

  return (
    <div style={{
      padding: '12px 14px 14px',
      background: 'var(--ph)',
      borderTop: '1px solid var(--n4)',
    }}>
      {/* Stat grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: comparisons.length ? 12 : 0 }}>
        {stats.map(s => (
          <Tile key={s.label} label={s.label} value={s.val} color={s.color}
            style={{ minWidth: 86, background: 'var(--chip-bg)', padding: '8px 11px' }} />
        ))}
      </div>

      {/* vs average */}
      {comparisons.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
            vs avg
          </div>
          {comparisons.map(c => (
            <span key={c.label} style={{
              fontSize: 11, color: c.color,
              background: 'var(--chip-bg)', border: '1px solid var(--card-bd)',
              borderRadius: 20, padding: '3px 9px',
              fontFamily: 'var(--mono)',
            }}>
              {c.label}: {c.txt}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PRTile({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="hx-tile" style={{ minWidth: 140 }}>
      <div className="l">{label}</div>
      <div className="n" style={{ color: 'var(--accent)' }}>{value}</div>
      <div className="sub">{meta}</div>
    </div>
  );
}

function PRSection({ activities, tab }: { activities: StravaRow[]; tab: Tab }) {
  let rows: { label: string; value: string; meta: string }[] = [];

  if (tab === 'run') {
    rows = runPRs(activities);
  } else if (tab === 'bike') {
    const prs = bikePRs(activities);
    rows = [
      ...(prs.longest ? [{ label: 'Longest ride',      value: prs.longest.val, meta: `${prs.longest.name.slice(0, 22)} · ${prs.longest.date}` }] : []),
      ...(prs.fastest ? [{ label: 'Fastest avg speed', value: prs.fastest.val, meta: `${prs.fastest.name.slice(0, 22)} · ${prs.fastest.date}` }] : []),
    ];
  }

  if (!rows.length) return null;
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: 8 }}>
        Personal Records
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {rows.map(r => <PRTile key={r.label} {...r} />)}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = { activities: StravaRow[]; loading: boolean; zones?: HrZone[] | null };

export function TrainingLog({ activities, loading, zones }: Props) {
  const [tab,        setTab]        = useState<Tab>('run');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = activities
    .filter(a => sportTab(a.sport_type) === tab)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 50);

  const avgs      = tabAverages(filtered);
  const volData   = buildVolData(filtered, tab);
  const volUnit   = tab === 'lift' ? 'min' : 'mi';
  const wdFreq    = tab === 'lift' ? weekdayFreq(filtered) : null;

  // Best guess at max HR for zone calculation
  const maxHrAll = Math.max(
    ...activities.filter(a => a.max_hr).map(a => a.max_hr as number),
    185,
  );

  const handleRowClick = (id: number) =>
    setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="card" style={{ gap: 18 }}>
      <CardHead icon="training" title="Training Log" source="strava" />

      {/* Tab bar */}
      <Seg
        options={TABS}
        value={tab}
        onChange={(t) => { setTab(t); setExpandedId(null); }}
        style={{ borderBottom: '1px solid var(--n4)', paddingBottom: 10 }}
      />

      {loading ? (
        <Skel h={200} />
      ) : (
        <>
          {/* Monthly summary card */}
          <SummaryCard acts={filtered} tab={tab} />

          {/* Lift: weekly consistency chart */}
          {tab === 'lift' && wdFreq && filtered.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
                Weekday consistency
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 56 }}>
                {wdFreq.map(d => (
                  <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: '100%', borderRadius: 4,
                      height: Math.max(4, Math.round(d.pct * 44)),
                      background: d.count > 0 ? SPORT_COLOR.lift : 'var(--ph)',
                      opacity: d.count > 0 ? 0.7 + d.pct * 0.3 : 0.4,
                      transition: 'height .4s ease',
                    }} />
                    <div style={{ fontSize: 9, color: 'var(--faint)' }}>{d.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity table */}
          {filtered.length === 0 ? (
            <EmptyState text={`No ${tab} activities`} />
          ) : (
            <div className="hx-table">
              {/* Table header */}
              <div className="hx-thead" style={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr auto auto',
                padding: '7px 14px',
              }}>
                <span />
                <span>Activity</span>
                <span style={{ textAlign: 'right', paddingRight: 12 }}>
                  {tab === 'bike' ? 'Speed' : tab === 'lift' ? 'HR' : 'Pace'}
                </span>
                <span style={{ textAlign: 'right' }}>Date</span>
              </div>

              {/* Compact viewport — a few rows visible, the rest scroll in place */}
              <div style={{ maxHeight: 248, overflowY: 'auto', overscrollBehavior: 'contain' }}>
              {filtered.map((a, i) => {
                const isExpanded = expandedId === a.id;
                const hasDist    = a.distance_m > 0 && a.duration_sec > 0;
                const zone       = effortZone(a.avg_hr, maxHrAll, zones);

                return (
                  <div key={a.id} style={{ borderTop: i > 0 ? '1px solid var(--n4)' : 'none' }}>
                    {/* Main row */}
                    <div
                      onClick={() => handleRowClick(a.id)}
                      className={`hx-row${isExpanded ? ' open' : ''}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '32px 1fr auto auto',
                        padding: '10px 14px',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 14, color: SPORT_COLOR[tab], opacity: 0.9 }}>{sportIcon(a.sport_type)}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--n1)', lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {a.name}
                          {(a.pr_count ?? 0) > 0 && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, letterSpacing: '.05em', color: PAL.accent2,
                              background: `color-mix(in oklch, ${PAL.accent2}, transparent 88%)`,
                              border: `1px solid color-mix(in oklch, ${PAL.accent2}, transparent 72%)`,
                              borderRadius: 5, padding: '1px 5px', flex: 'none',
                            }}>
                              PR
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 1, display: 'flex', gap: 6 }}>
                          {hasDist && <span>{fmtDist(a.distance_m, tab)}</span>}
                          <span>{fmtDur(a.duration_sec)}</span>
                          {a.avg_hr && <span>{a.avg_hr} bpm</span>}
                          {zone && (
                            <span style={{ color: ZONE_COLORS[zone] ?? 'var(--faint)' }}>{zone}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', paddingRight: 12, fontFamily: 'var(--mono)', fontSize: 12 }}>
                        {hasDist && (
                          tab === 'bike' ? fmtSpeed(a.distance_m, a.duration_sec)
                            : tab === 'lift' ? (a.avg_hr ? `${a.avg_hr} bpm` : '—')
                            : fmtPace(a.distance_m, a.duration_sec)
                        )}
                      </div>
                      <div style={{
                        textAlign: 'right', fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--mono)',
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
                      }}>
                        <span>{fmtDate(a.date)}</span>
                        <span style={{ fontSize: 9, opacity: 0.6 }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <ExpandedRow
                        activity={a}
                        avgs={avgs}
                        tab={tab}
                        maxHrAll={maxHrAll}
                        zones={zones}
                      />
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          )}

          {/* 12-week volume chart */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
              Weekly volume · 12 weeks ({volUnit})
            </div>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={volData} barCategoryGap="30%">
                <XAxis dataKey="wk" tick={{ fontSize: 9, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                  tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM}
                  cursor={{ fill: 'var(--chip-bg)' }}
                  formatter={(v) => [`${v} ${volUnit}`, 'Volume']}
                />
                <Bar dataKey="val" fill={SPORT_COLOR[tab]} radius={[3, 3, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Personal records */}
          <PRSection activities={activities} tab={tab} />
        </>
      )}
    </div>
  );
}
