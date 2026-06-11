'use client';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { WellnessRow, StravaRow } from './useHealthData';
import { rollingAvg, avg } from './useHealthData';
import { Skel, EmptyState, CardHead, Tile, Legend, TOOLTIP_STYLE, TOOLTIP_LABEL, TOOLTIP_ITEM, PAL } from './shared';

type Props = { wellness: WellnessRow[]; loading: boolean; activities?: StravaRow[] };

function shortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10, color: 'var(--faint)', marginBottom: 8,
  textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600,
};

/* ── Recovery snapshot: today vs your own 30-day baseline ──────────────────── */

function RecoverySnapshot({ wellness }: { wellness: WellnessRow[] }) {
  const last30 = wellness.slice(-30);
  const latest = [...last30].reverse().find(r => r.hrv != null || r.resting_hr != null);
  if (!latest) return null;

  const hrvBase = avg(last30.map(r => r.hrv));
  const rhrBase = avg(last30.map(r => r.resting_hr));
  const vo2     = [...last30].reverse().find(r => r.vo2_max != null)?.vo2_max ?? null;

  const hrvDelta = latest.hrv != null && hrvBase ? ((latest.hrv - hrvBase) / hrvBase) * 100 : null;
  const rhrDelta = latest.resting_hr != null && rhrBase ? latest.resting_hr - rhrBase : null;

  return (
    <div>
      <div style={SECTION_LABEL}>Today vs your 30-day baseline</div>
      <div className="hx-tiles" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Tile label="HRV" value={latest.hrv != null ? String(latest.hrv) : '—'} unit="ms"
          color={hrvDelta == null ? undefined : hrvDelta >= 0 ? PAL.ok : hrvDelta < -10 ? PAL.danger : PAL.warn}
          sub={hrvDelta != null ? `${hrvDelta >= 0 ? '+' : ''}${hrvDelta.toFixed(0)}% vs baseline` : undefined} />
        <Tile label="Resting HR" value={latest.resting_hr != null ? String(latest.resting_hr) : '—'} unit="bpm"
          color={rhrDelta == null ? undefined : rhrDelta <= 0 ? PAL.ok : rhrDelta > 3 ? PAL.danger : PAL.warn}
          sub={rhrDelta != null ? `${rhrDelta >= 0 ? '+' : ''}${rhrDelta.toFixed(1)} vs baseline` : undefined} />
        <Tile label="VO₂ max" value={vo2 != null ? String(vo2) : '—'} unit="ml/kg"
          sub={vo2 != null && vo2 >= 49 ? 'top ~5% for age 22' : undefined} color={vo2 != null && vo2 >= 49 ? PAL.ok : undefined} />
      </div>
    </div>
  );
}

/* ── Fitness vs fatigue (CTL/ATL from intervals.icu) ───────────────────────── */

function LoadChart({ wellness }: { wellness: WellnessRow[] }) {
  const rows = wellness.slice(-60).filter(r => r.ctl != null || r.atl != null);
  if (rows.length < 7) return null;

  const data = rows.map(r => ({
    date: shortDate(r.date),
    ctl:  r.ctl != null ? +r.ctl.toFixed(1) : null,
    atl:  r.atl != null ? +r.atl.toFixed(1) : null,
  }));
  const last = rows[rows.length - 1];
  const tsb  = last.ctl != null && last.atl != null ? last.ctl - last.atl : null;
  const verdict = tsb == null ? null
    : tsb > 5   ? { label: 'fresh — good day to go hard', color: PAL.ok }
    : tsb > -10 ? { label: 'productive training stress',  color: PAL.warn }
    :             { label: 'deep fatigue — recover',      color: PAL.danger };

  return (
    <div>
      <div style={{ ...SECTION_LABEL, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span>Fitness vs Fatigue</span>
        {tsb != null && verdict && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: verdict.color, textTransform: 'none', letterSpacing: 0 }}>
            form {tsb > 0 ? '+' : ''}{tsb.toFixed(1)} · {verdict.label}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--n4)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
            tickLine={false} axisLine={false} interval={9} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
            tickLine={false} axisLine={false} width={28} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM}
            formatter={(v, name) => [String(v), name === 'ctl' ? 'fitness (CTL)' : 'fatigue (ATL)']} />
          <Area type="monotone" dataKey="ctl" stroke={PAL.viz} strokeWidth={2}
            fill="color-mix(in oklch, var(--viz), transparent 82%)" name="ctl" connectNulls />
          <Line type="monotone" dataKey="atl" stroke={PAL.warn} strokeWidth={1.5}
            strokeDasharray="4 3" dot={false} name="atl" connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
      <Legend style={{ marginTop: 4 }} items={[
        { color: PAL.viz,  label: 'fitness (CTL) — builds slowly' },
        { color: PAL.warn, label: 'fatigue (ATL) — fades fast' },
      ]} />
    </div>
  );
}

/* ── Running economy: metres covered per heartbeat ─────────────────────────── */

function EconomyChart({ activities }: { activities: StravaRow[] }) {
  const runs = activities
    .filter(a => /run/i.test(a.sport_type) && (a.avg_hr ?? 0) > 100 && (a.avg_speed_ms ?? 0) > 1 && a.duration_sec > 600)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (runs.length < 4) return null;

  const data = runs.map(r => ({
    date: shortDate(r.date.slice(0, 10)),
    econ: +(((r.avg_speed_ms! * 60) / r.avg_hr!)).toFixed(2),   // metres per heartbeat
    pace: 26.8224 / r.avg_speed_ms!,                            // min/mi for the tooltip
    hr:   Math.round(r.avg_hr!),
  }));
  const first3 = avg(data.slice(0, 3).map(d => d.econ));
  const last3  = avg(data.slice(-3).map(d => d.econ));
  const gain   = first3 && last3 ? ((last3 - first3) / first3) * 100 : null;

  return (
    <div>
      <div style={{ ...SECTION_LABEL, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span>Running economy · metres per heartbeat</span>
        {gain != null && Math.abs(gain) >= 1 && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: gain > 0 ? PAL.ok : PAL.warn, textTransform: 'none', letterSpacing: 0 }}>
            {gain > 0 ? '+' : ''}{gain.toFixed(0)}% vs first runs — {gain > 0 ? 'same beat buys more road' : 'fatigue or heat in the data'}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={110}>
        <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--n4)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
            tickLine={false} axisLine={false} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
            tickLine={false} axisLine={false} width={32} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM}
            formatter={(v, name, item) => {
              if (name !== 'econ') return [String(v), String(name)];
              const p = (item?.payload as typeof data[0] | undefined);
              const mm = p ? `${Math.floor(p.pace)}:${String(Math.round((p.pace % 1) * 60)).padStart(2, '0')}/mi @ ${p.hr} bpm` : '';
              return [`${v} m/beat · ${mm}`, 'economy'];
            }} />
          <Line type="monotone" dataKey="econ" stroke="var(--accent2)" strokeWidth={2}
            dot={{ r: 2.5, fill: 'var(--accent2)' }} name="econ" />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>
        Distance each heartbeat buys you on a run — the purest aerobic fitness signal in this data. Up and to the right = engine getting bigger.
      </div>
    </div>
  );
}

export function HeartSection({ wellness, loading, activities }: Props) {
  const last60 = wellness.slice(-60);

  const hrv7   = rollingAvg(last60.map(r => r.hrv), 7);
  const hr7    = rollingAvg(last60.map(r => r.resting_hr), 7);

  const chartData = last60.map((r, i) => ({
    date:   shortDate(r.date),
    hrv:    r.hrv,
    rhr:    r.resting_hr,
    hrv7:   hrv7[i]  != null ? +hrv7[i]!.toFixed(1)  : null,
    rhr7:   hr7[i]   != null ? +hr7[i]!.toFixed(1)   : null,
    vo2:    r.vo2_max,
  }));

  return (
    <div className="card" style={{ gap: 16 }}>
      <CardHead icon="heart" title="Heart & Recovery" source="garmin" meta="60 days" />

      {loading ? (
        <Skel h={200} />
      ) : last60.length === 0 ? (
        <EmptyState text="No heart data yet — sync Garmin" />
      ) : (
        <>
          {/* HRV + Resting HR dual-axis */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
              HRV & Resting Heart Rate
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--n4)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                  tickLine={false} axisLine={false} interval={9} />
                <YAxis yAxisId="hrv" orientation="left" domain={['auto','auto']}
                  tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }} tickLine={false} axisLine={false}
                  label={{ value: 'HRV ms', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: 'var(--faint)' }, offset: 10 }} />
                <YAxis yAxisId="hr" orientation="right" domain={['auto','auto']}
                  tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }} tickLine={false} axisLine={false}
                  label={{ value: 'bpm', angle: 90, position: 'insideRight', style: { fontSize: 9, fill: 'var(--faint)' }, offset: 10 }} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL}
                  itemStyle={TOOLTIP_ITEM}
                />
                <Line yAxisId="hrv" type="monotone" dataKey="hrv" stroke={PAL.viz} strokeOpacity={0.35}
                  dot={false} strokeWidth={1} name="HRV" connectNulls />
                <Line yAxisId="hrv" type="monotone" dataKey="hrv7" stroke={PAL.viz}
                  dot={false} strokeWidth={2} name="HRV 7d avg" connectNulls />
                <Line yAxisId="hr" type="monotone" dataKey="rhr" stroke={PAL.danger} strokeOpacity={0.35}
                  dot={false} strokeWidth={1} name="Resting HR" connectNulls />
                <Line yAxisId="hr" type="monotone" dataKey="rhr7" stroke={PAL.danger}
                  dot={false} strokeWidth={2} name="RHR 7d avg" connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
            <Legend style={{ marginTop: 6 }} items={[
              { color: PAL.viz, label: "HRV (7d avg)" },
              { color: PAL.danger, label: 'Resting HR (7d avg)' },
            ]} />
          </div>

          <RecoverySnapshot wellness={wellness} />
          <LoadChart wellness={wellness} />
          {activities && activities.length > 0 && <EconomyChart activities={activities} />}

          {/* VO2 Max trend */}
          {chartData.some(d => d.vo2 != null) && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
                VO₂ Max trend
              </div>
              <ResponsiveContainer width="100%" height={80}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--n4)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                    tickLine={false} axisLine={false} interval={9} />
                  <YAxis domain={['auto','auto']} tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                    tickLine={false} axisLine={false} width={28} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL}
                    itemStyle={TOOLTIP_ITEM}
                  />
                  <Line type="monotone" dataKey="vo2" stroke={PAL.ok}
                    dot={false} strokeWidth={2} name="VO₂ Max" connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
