'use client';
import { BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { StravaRow, HrZone } from '../health/useHealthData';
import { hrZoneIndex, sportTab } from '../health/useHealthData';
import { Skel, CardHead, EmptyState, TOOLTIP_STYLE, TOOLTIP_LABEL, TOOLTIP_ITEM, PAL, SPORT_COLOR } from '../health/shared';

const M_PER_MI = 1609.344;

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function weekStart(d: Date): string {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtHm(secs: number): string {
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtShortDate(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

/* ── Relative Effort — weekly training load, Strava's suffer score ──────────── */

export function EffortCard({ activities, loading }: { activities: StravaRow[]; loading: boolean }) {
  // Last 8 ISO weeks (Mon-start), summed relative effort
  const thisWk = weekStart(new Date());
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (7 - i) * 7);
    return weekStart(d);
  });
  const data = weeks.map(wk => ({
    wk,
    label: fmtShortDate(wk),
    effort: Math.round(activities
      .filter(a => weekStart(new Date(a.date + 'T12:00')) === wk)
      .reduce((s, a) => s + (a.relative_effort ?? 0), 0)),
  }));

  const hasData   = data.some(d => d.effort > 0);
  const thisWkVal = data[data.length - 1].effort;
  const lastWkVal = data[data.length - 2].effort;
  const avg4      = Math.round(data.slice(-5, -1).reduce((s, d) => s + d.effort, 0) / 4);
  const deltaPct  = lastWkVal > 0 ? Math.round((thisWkVal - lastWkVal) / lastWkVal * 100) : null;

  return (
    <div className="card" style={{ gap: 14 }}>
      <CardHead icon="effort" title="Relative Effort" source="strava" meta="8 weeks" />

      {loading ? (
        <Skel h={140} />
      ) : !hasData ? (
        <EmptyState text="No effort data yet — appears after the next Strava sync" />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 36, fontWeight: 700, lineHeight: 1, letterSpacing: '-.02em', color: PAL.viz }}>
              {thisWkVal}
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600 }}>This week</div>
              <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 2 }}>
                {deltaPct != null && (
                  <span style={{ color: deltaPct > 25 ? PAL.warn : 'var(--mut)' }}>
                    {deltaPct >= 0 ? '↑' : '↓'} {Math.abs(deltaPct)}% vs last wk
                  </span>
                )}
                {avg4 > 0 && <span style={{ color: 'var(--faint)' }}> · 4wk avg {avg4}</span>}
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={104}>
            <BarChart data={data} barCategoryGap="22%" margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                tickLine={false} axisLine={false} interval={0} />
              <YAxis hide />
              <Tooltip
                contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM}
                cursor={{ fill: 'var(--chip-bg)' }}
                formatter={(v) => [String(v), 'Relative effort']}
                labelFormatter={(l) => `Week of ${l}`}
              />
              <Bar dataKey="effort" radius={[3, 3, 0, 0]}>
                {data.map(d => (
                  <Cell key={d.wk} fill={PAL.viz} opacity={d.wk === thisWk ? 1 : 0.45} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div style={{ fontSize: 10.5, color: 'var(--faint)', lineHeight: 1.5 }}>
            Strava&apos;s suffer score — how hard each week actually was, weighted by time in high HR zones.
          </div>
        </>
      )}
    </div>
  );
}

/* ── Run Trends — pace trajectory, easy/hard split, aerobic efficiency ────────
   Runs only: zone math on whole-session avg HR is meaningless for lifts, and
   session-level intensity (easy vs hard run) is honest about that granularity. */

function fmtPace(secPerMi: number): string {
  const m = Math.floor(secPerMi / 60), s = Math.round(secPerMi % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Distance covered per heartbeat (m/beat) — rises as aerobic fitness improves. */
function efficiency(runs: StravaRow[]): number | null {
  const withHr = runs.filter(a => (a.avg_hr ?? 0) > 90);
  const beats = withHr.reduce((s, a) => s + a.avg_hr! * a.duration_sec / 60, 0);
  const dist  = withHr.reduce((s, a) => s + a.distance_m, 0);
  return beats > 0 ? dist / beats : null;
}

export function RunTrendsCard({ activities, zones, loading }: {
  activities: StravaRow[]; zones: HrZone[] | null; loading: boolean;
}) {
  const RUN = SPORT_COLOR.run;
  // Skip sub-half-mile entries (treadmill glitches, abandoned starts)
  const runs = activities.filter(a =>
    sportTab(a.sport_type) === 'run' && a.distance_m > 800 && a.duration_sec > 0);

  // Weekly avg pace = total time ÷ total miles, last 8 ISO weeks
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (7 - i) * 7);
    return weekStart(d);
  });
  const data = weeks.map(wk => {
    const ws  = runs.filter(a => weekStart(new Date(a.date + 'T12:00')) === wk);
    const mi  = ws.reduce((s, a) => s + a.distance_m, 0) / M_PER_MI;
    const sec = ws.reduce((s, a) => s + a.duration_sec, 0);
    return { wk, label: fmtShortDate(wk), mi, pace: mi > 0.5 ? sec / mi : null };
  });
  const paced  = data.filter(d => d.pace != null);
  const latest = paced[paced.length - 1];
  const prior  = paced.slice(0, -1);
  const priorAvg  = prior.length ? prior.reduce((s, d) => s + d.pace!, 0) / prior.length : null;
  const paceDelta = latest && priorAvg != null ? Math.round(latest.pace! - priorAvg) : null;

  // Easy/hard session split, last 4 weeks — Z1-2 easy, Z3+ hard (80/20 check)
  const zs = zones ?? [];
  let easySec = 0, hardSec = 0;
  if (zs.length) {
    for (const a of runs) {
      if (a.date < daysAgo(28) || !a.avg_hr) continue;
      if (hrZoneIndex(a.avg_hr, zs) <= 2) easySec += a.duration_sec;
      else hardSec += a.duration_sec;
    }
  }
  const splitTotal = easySec + hardSec;
  const easyPct = splitTotal > 0 ? Math.round(easySec / splitTotal * 100) : null;

  // Aerobic efficiency — this 4 weeks vs the 4 before
  const effNow  = efficiency(runs.filter(a => a.date >= daysAgo(28)));
  const effPrev = efficiency(runs.filter(a => a.date >= daysAgo(56) && a.date < daysAgo(28)));
  const effDelta = effNow != null && effPrev != null && effPrev > 0
    ? (effNow - effPrev) / effPrev * 100 : null;

  return (
    <div className="card" style={{ gap: 14 }}>
      <CardHead icon="trend" title="Run Trends" source="strava" meta="8 weeks" />

      {loading ? (
        <Skel h={140} />
      ) : paced.length < 2 ? (
        <EmptyState text="Not enough runs yet — trends appear after a couple of weeks" />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 36, fontWeight: 700, lineHeight: 1, letterSpacing: '-.02em', color: RUN }}>
              {fmtPace(latest.pace!)}
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--faint)' }}> /mi</span>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600 }}>
                Avg pace · wk of {latest.label}
              </div>
              {paceDelta != null && (
                <div style={{ fontSize: 12, marginTop: 2, color: paceDelta <= 0 ? PAL.ok : PAL.warn }}>
                  {paceDelta <= 0 ? '↓' : '↑'} {Math.abs(paceDelta)}s/mi vs prior weeks
                </div>
              )}
            </div>
          </div>

          {/* Pace line — reversed axis so up = faster */}
          <ResponsiveContainer width="100%" height={88}>
            <LineChart data={data} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                tickLine={false} axisLine={false} interval={0} />
              <YAxis hide reversed domain={['dataMin - 15', 'dataMax + 15']} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM}
                cursor={false}
                formatter={(v) => [`${fmtPace(Number(v))} /mi`, 'Avg pace']}
                labelFormatter={(l) => `Week of ${l}`}
              />
              <Line type="monotone" dataKey="pace" connectNulls
                stroke={RUN} strokeWidth={2}
                dot={{ r: 2.5, fill: RUN, strokeWidth: 0 }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>

          {/* Easy/hard split — the 80/20 polarization check */}
          {easyPct != null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--mut)' }}>
                <span><b style={{ color: PAL.ok }}>{easyPct}%</b> easy (Z1–2)</span>
                <span><b style={{ color: PAL.danger }}>{100 - easyPct}%</b> hard (Z3+)</span>
              </div>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                <div style={{ flex: easyPct, background: PAL.ok, minWidth: 2 }} />
                <div style={{ flex: 100 - easyPct, background: PAL.danger, minWidth: 2 }} />
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--faint)' }}>
                Run time by session intensity, 4 wks · most plans target ~80% easy
              </div>
            </div>
          )}

          {effDelta != null && (
            <div style={{ fontSize: 11.5, color: 'var(--mut)', lineHeight: 1.5 }}>
              Aerobic efficiency{' '}
              <b style={{ color: effDelta >= 0 ? PAL.ok : PAL.warn }}>
                {effDelta >= 0 ? '↑' : '↓'} {Math.abs(effDelta).toFixed(1)}%
              </b>{' '}
              — {effDelta >= 0 ? 'more' : 'less'} ground per heartbeat than the previous month.
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Lift Trends — weekly strength volume and consistency ─────────────────────── */

export function LiftTrendsCard({ activities, loading }: { activities: StravaRow[]; loading: boolean }) {
  const LIFT = SPORT_COLOR.lift;
  const lifts = activities.filter(a => sportTab(a.sport_type) === 'lift' && a.duration_sec > 0);

  const thisWk = weekStart(new Date());
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (7 - i) * 7);
    return weekStart(d);
  });
  const data = weeks.map(wk => {
    const ws = lifts.filter(a => weekStart(new Date(a.date + 'T12:00')) === wk);
    return {
      wk, label: fmtShortDate(wk),
      sessions: ws.length,
      mins: Math.round(ws.reduce((s, a) => s + a.duration_sec, 0) / 60),
    };
  });
  const hasData   = data.some(d => d.sessions > 0);
  const thisCount = data[data.length - 1].sessions;
  const avgPerWk  = data.slice(0, -1).reduce((s, d) => s + d.sessions, 0) / (data.length - 1);

  const recent = lifts.filter(a => a.date >= daysAgo(28));
  const avgLen = recent.length ? Math.round(recent.reduce((s, a) => s + a.duration_sec, 0) / recent.length / 60) : 0;

  // Consecutive weeks with ≥2 lifts; the in-progress week can't break it yet
  let streak = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].wk === thisWk && data[i].sessions < 2) continue;
    if (data[i].sessions >= 2) streak++;
    else break;
  }

  return (
    <div className="card" style={{ gap: 14 }}>
      <CardHead icon="lift" title="Lift Trends" source="strava" meta="8 weeks" />

      {loading ? (
        <Skel h={140} />
      ) : !hasData ? (
        <EmptyState text="No strength sessions logged yet — they'll trend here" />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 36, fontWeight: 700, lineHeight: 1, letterSpacing: '-.02em', color: LIFT }}>
              {thisCount}
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--faint)' }}> lifts</span>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600 }}>This week</div>
              <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 2 }}>
                {avgPerWk.toFixed(1)}/wk avg
                {avgLen > 0 && <span style={{ color: 'var(--faint)' }}> · ~{avgLen}m per session</span>}
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={104}>
            <BarChart data={data} barCategoryGap="22%" margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                tickLine={false} axisLine={false} interval={0} />
              <YAxis hide />
              <Tooltip
                contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM}
                cursor={{ fill: 'var(--chip-bg)' }}
                formatter={(v, _n, item) => [`${fmtHm(Number(v) * 60)} · ${item?.payload?.sessions ?? 0} sessions`, 'Lifting']}
                labelFormatter={(l) => `Week of ${l}`}
              />
              <Bar dataKey="mins" radius={[3, 3, 0, 0]}>
                {data.map(d => (
                  <Cell key={d.wk} fill={LIFT} opacity={d.wk === thisWk ? 1 : 0.45} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {streak >= 2 ? (
            <div className="chips">
              <span className="chip acc">▲ {streak >= 8 ? '8+' : streak} week{streak === 1 ? '' : 's'} running at 2+ lifts/wk</span>
            </div>
          ) : (
            <div style={{ fontSize: 10.5, color: 'var(--faint)', lineHeight: 1.5 }}>
              Time under the bar each week — consistency is the whole game during a run block.
            </div>
          )}
        </>
      )}
    </div>
  );
}
