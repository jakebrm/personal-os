'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { WellnessRow } from './useHealthData';
import { Skel, CardHead, Tile, Legend, TOOLTIP_STYLE, PAL } from './shared';

type Props = { wellness: WellnessRow[]; loading: boolean };

function tsbColor(tsb: number): string {
  if (tsb > 10)   return PAL.ok;
  if (tsb >= 0)   return PAL.viz;
  if (tsb >= -10) return PAL.warn;
  return PAL.danger;
}

function tsbLabel(tsb: number): { status: string; rec: string } {
  if (tsb > 10)   return { status: 'Fresh',      rec: 'Good day for a hard session or race effort' };
  if (tsb >= 0)   return { status: 'Neutral',    rec: 'Moderate effort is fine — stay controlled' };
  if (tsb >= -10) return { status: 'Tired',      rec: 'Keep it easy today — aerobic base only' };
  return               { status: 'Very Tired',   rec: 'Rest or recovery only — let the body catch up' };
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getMonth()+1}/${d.getDate()}`;
}

export function ReadinessRing({ wellness, loading }: Props) {
  // Find last row with both CTL and ATL
  const last = [...wellness].reverse().find(r => r.ctl != null && r.atl != null);
  const ctl  = last?.ctl  ?? null;
  const atl  = last?.atl  ?? null;
  const tsb  = (ctl != null && atl != null) ? parseFloat((ctl - atl).toFixed(1)) : null;

  // 6-week trend data for dual line chart (use last 42 days with ctl/atl)
  const trendData = wellness
    .filter(r => r.ctl != null || r.atl != null)
    .slice(-42)
    .map(r => ({
      date: shortDate(r.date),
      ctl:  r.ctl  != null ? parseFloat((r.ctl  as number).toFixed(1)) : null,
      atl:  r.atl  != null ? parseFloat((r.atl  as number).toFixed(1)) : null,
    }));

  const color = tsb != null ? tsbColor(tsb) : 'var(--faint)';
  const info  = tsb != null ? tsbLabel(tsb) : null;

  return (
    <div className="card" style={{ gap: 16 }}>
      <CardHead icon="readiness" title="Readiness" source="intervals.icu" />

      {loading ? (
        <>
          <Skel h={70} style={{ width: '40%' }} />
          <Skel h={80} />
        </>
      ) : (
        <>
          {/* Hero: TSB number + status */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 46, fontWeight: 700, lineHeight: 1, color, letterSpacing: '-0.03em' }}>
                {tsb != null ? (tsb > 0 ? `+${tsb}` : String(tsb)) : '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: 3, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                Form (TSB)
              </div>
            </div>

            {info && (
              <div style={{ paddingBottom: 4 }}>
                <div style={{ fontSize: 19, fontWeight: 800, color, letterSpacing: '-.02em', lineHeight: 1 }}>
                  {info.status}
                </div>
                <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 5, maxWidth: 280, lineHeight: 1.5 }}>
                  {info.rec}
                </div>
              </div>
            )}
          </div>

          {/* CTL / ATL / TSB stat row */}
          <div className="hx-tiles" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <Tile label="Fitness · CTL" value={ctl != null ? String(Math.round(ctl)) : "—"} color={PAL.viz} />
            <Tile label="Fatigue · ATL" value={atl != null ? String(Math.round(atl)) : '—'} color={PAL.danger} />
            <Tile label="Form · TSB"    value={tsb != null ? (tsb > 0 ? `+${tsb}` : String(tsb)) : '—'} color={color} />
          </div>

          {/* Dual-line CTL / ATL trend chart */}
          {trendData.length >= 2 && (
            <div>
              <div style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, marginBottom: 10 }}>
                6-week fitness / fatigue trend
              </div>
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={trendData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                    tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any, name: any) => [typeof v === 'number' ? v.toFixed(1) : '—', name === 'ctl' ? 'Fitness (CTL)' : 'Fatigue (ATL)'] as [string, string]}
                  />
                  <Line type="monotone" dataKey="ctl" stroke={PAL.viz} strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="atl" stroke={PAL.danger} strokeWidth={2} dot={false} connectNulls strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
              <Legend style={{ marginTop: 6 }} items={[
                { color: PAL.viz, label: "Fitness (CTL)" },
                { color: PAL.danger, label: 'Fatigue (ATL)' },
              ]} />
            </div>
          )}

          {tsb == null && (
            <div style={{ fontSize: 12, color: 'var(--faint)' }}>
              CTL / ATL data not available — sync Garmin data to see training readiness
            </div>
          )}
        </>
      )}
    </div>
  );
}
